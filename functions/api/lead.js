// POST /api/lead — self-hosted lead intake for The Beat Boutique.
// Replaces the dead Formspark endpoint. Order of operations matters: the lead is
// written to D1 BEFORE anything that can fail (notification email, etc.) so no
// submission is ever lost. Spam-flagged submissions (detectSpam heuristics) are
// stored but not emailed.
//
// Bindings (configured via the Cloudflare API, not wrangler.toml):
//   env.DB              — D1 database (bound as `DB`)
//   env.RESEND_API_KEY  — Resend API key (optional: email is skipped without it)
//   env.LEAD_NOTIFY_TO  — notification recipient address(es), comma-separated
//   env.LEAD_NOTIFY_FROM — notification sender address (optional, sensible default)
//   env.LEADS_PASSWORD  — used by the /leads dashboard, not here

const SUCCESS_FALLBACK = "https://thebeatboutique.ie/thank-you/";
const APEX_HOST = "thebeatboutique.ie";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD_CHARS = 5000;                 // cap on every individual value
const MAX_RAW_JSON_BYTES = 64 * 1024;         // cap on the whole raw_json payload
const MAX_BODY_BYTES = 512000;                // cap on the whole request body
const RATE_LIMIT_MAX = 20;  // per IP per window; over this the lead is still stored, just not emailed
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;  // 60 minutes

// All writable lead columns, in schema order. Values are always passed as bound
// parameters — never interpolated into SQL.
const LEAD_COLUMNS = [
    "names", "email", "phone", "wedding_date", "event_date", "venue",
    "message", "how_found", "interest", "subject", "form_source", "form_id",
    "lead_type", "page_url", "page_path", "page_category", "page_focus",
    "landing_page", "referrer", "first_referrer", "first_seen_at",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "gclid", "fbclid",
    "first_utm_source", "first_utm_medium", "first_utm_campaign",
    "first_utm_content", "first_utm_term", "first_gclid", "first_fbclid",
    "lead_created_at",
];

// Fields consumed by the HERO block (names, phone/email action row, and the
// date/venue facts) — these are rendered by their own dedicated layout, never
// as plain rows in the details table.
const HERO_FIELDS = new Set([
    "names", "phone", "email", "wedding_date", "event_date", "venue",
]);

// Fields shown in the DETAILS table, before any extra non-internal field.
const DETAIL_FIELDS = ["message", "how_found", "interest", "event_date"];

// Fields shown in the demoted "Where this lead came from" block.
const ATTRIBUTION_FIELDS = [
    "form_source", "page_path",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "gclid", "fbclid", "referrer", "landing_page", "country",
];
// Plumbing / bookkeeping fields that never appear in the email body.
const INTERNAL_FIELDS = new Set([
    "_gotcha", "redirect", "raw_json",
    "subject", "form_id", "page_url", "page_category", "page_focus",
    "ip", "user_agent", "rate_limited",
    "lead_created_at", "first_seen_at", "created_at",
    "first_referrer", "first_utm_source", "first_utm_medium", "first_utm_campaign",
    "first_utm_content", "first_utm_term", "first_gclid", "first_fbclid",
]);

// Font stacks that match the site's Playfair Display / Montserrat pairing but
// degrade gracefully in email clients (web fonts are unreliable/blocked).
const FONT_SERIF = "Georgia,'Times New Roman',serif";
const FONT_SANS = "'Segoe UI',Helvetica,Arial,sans-serif";

const LABELS = {
    names: "Names", email: "Email", phone: "Phone", wedding_date: "Wedding date",
    event_date: "Event date", venue: "Venue", message: "Message",
    how_found: "How found us", interest: "Interest", subject: "Subject",
    form_source: "Form source", form_id: "Form ID", lead_type: "Lead type",
    page_url: "Page URL", page_path: "Page path", page_category: "Page category",
    page_focus: "Page focus", landing_page: "Landing page", referrer: "Referrer",
    first_referrer: "First referrer", first_seen_at: "First seen at",
    utm_source: "UTM source", utm_medium: "UTM medium", utm_campaign: "UTM campaign",
    utm_content: "UTM content", utm_term: "UTM term", gclid: "GCLID", fbclid: "FBCLID",
    first_utm_source: "First UTM source", first_utm_medium: "First UTM medium",
    first_utm_campaign: "First UTM campaign", first_utm_content: "First UTM content",
    first_utm_term: "First UTM term", first_gclid: "First GCLID", first_fbclid: "First FBCLID",
    lead_created_at: "Lead created at", ip: "IP address", country: "Country",
    user_agent: "User agent", created_at: "Received at",
};

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

export async function onRequestPost(context) {
    const { request, env } = context;
    try {
        // a. Read the submission. Every field becomes a key on a plain object.
        // Guard the body size BEFORE parsing so an oversized or malformed body
        // never reaches the success redirect. The Content-Length check is a cheap
        // fast-path early rejection; the real cap is enforced on the body stream
        // itself so chunked/headerless bodies can't bypass it (FIX E).
        const contentLengthHeader = request.headers.get("content-length");
        if (contentLengthHeader !== null && Number(contentLengthHeader) > 512000) {
            console.error("[lead] body too large (content-length " + contentLengthHeader + ") — rejecting.");
            return errorRedirect(request);
        }
        const collectedBytes = await collectBody(request.body);
        if (collectedBytes === null) {
            console.error("[lead] body too large (> " + MAX_BODY_BYTES + " bytes) or streaming failed — rejecting.");
            return errorRedirect(request);
        }
        const rebuilt = new Request(request.url, {
            method: "POST",
            headers: request.headers,
            body: collectedBytes,
        });
        const fields = await readFields(rebuilt);
        if (fields === null) {
            // request.formData() failed to parse — never show success (FIX 3).
            return errorRedirect(request);
        }

        // b. Honeypot: a filled `_gotcha` means a bot. No store, no email — but
        // return the normal success redirect so bots see success and don't retry.
        if (fields._gotcha && String(fields._gotcha).trim() !== "") {
            return successRedirect(request, fields);
        }

        // c. Validate. Trim all values first, then check required fields.
        for (const key of Object.keys(fields)) {
            if (typeof fields[key] === "string") fields[key] = fields[key].trim();
        }
        const names = fields.names || "";
        const email = fields.email || "";
        if (!names || !email || !EMAIL_RE.test(email)) {
            return errorRedirect(request);
        }
        // Cap every individual value at 5000 chars.
        for (const key of Object.keys(fields)) {
            if (typeof fields[key] === "string" && fields[key].length > MAX_FIELD_CHARS) {
                fields[key] = fields[key].slice(0, MAX_FIELD_CHARS);
            }
        }

        // Spam heuristics: bots POSTing the raw form directly never carry the
        // JS-injected fields (page_path / first_seen_at / lead_created_at).
        const spamCheck = detectSpam(fields);
        const isSpam = spamCheck.score >= 2;

        // d+e. Rate limit + INSERT — each in its own try/catch. If the rate-limit
        // COUNT query fails we fail OPEN (treat as not rate limited) and still
        // attempt the INSERT, so a genuine enquiry is never dropped. Only a
        // failing INSERT may set storedOk = false. A rate-limited submission is
        // ALWAYS still written to the database (storing rate_limited = 1) and is
        // simply not emailed (FIX 1, FIX 2).
        const ip = request.headers.get("CF-Connecting-IP") || "";
        const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
        const nowIso = new Date().toISOString();
        const row = {
            ...fields,
            created_at: nowIso,
            lead_created_at: fields.lead_created_at || nowIso,
            ip,
            country: (request.cf && request.cf.country) || "",
            user_agent: request.headers.get("User-Agent") || "",
            rate_limited: 0,
            spam: isSpam ? 1 : 0,
            spam_reason: spamCheck.reasons.join(","),
            raw_json: capRawJson(fields),
        };
        const allColumns = ["created_at", ...LEAD_COLUMNS, "ip", "country", "user_agent", "rate_limited", "spam", "spam_reason", "raw_json"];
        const sql = `INSERT INTO leads (${allColumns.join(", ")}) VALUES (${allColumns.map(() => "?").join(", ")})`;
        let leadId = null;
        let storedOk = false;
        let rateLimited = false;
        let rateLimitCount = 0;
        try {
            const countRow = await env.DB.prepare(
                "SELECT COUNT(*) AS c FROM leads WHERE ip = ? AND created_at >= ?"
            ).bind(ip, since).first();
            if ((countRow && countRow.c) >= RATE_LIMIT_MAX) {
                rateLimited = true;
                rateLimitCount = countRow ? countRow.c : RATE_LIMIT_MAX;
                row.rate_limited = 1;
            }
        } catch (err) {
            console.error("[lead] rate-limit COUNT query failed (fail open):", err);
        }
        const values = allColumns.map((col) => {
            const v = row[col];
            return v === undefined || v === null ? null : String(v);
        });
        try {
            const insert = await env.DB.prepare(sql).bind(...values).run();
            if (insert.meta && insert.meta.last_row_id !== undefined) {
                leadId = insert.meta.last_row_id;
            }
            storedOk = true;
        } catch (err) {
            console.error("[lead] INSERT failed:", err);
            storedOk = false;
        }
        const notificationPrefix = storedOk ? "" : "[NOT SAVED] ";
        const warningNotice = storedOk
            ? ""
            : "WARNING: this lead could NOT be written to the database. This email is the only copy — save it now.\n\n";

        // f. Notification email via Resend — best effort, inside waitUntil so it
        // never delays the redirect and never fails the request.
        context.waitUntil((async () => {
            try {
                if (!storedOk) {
                    // Write failed — this email is the only surviving copy, so it must
                    // ALWAYS be sent, regardless of rate-limit state (FIX A). The
                    // warning band and [NOT SAVED] prefix communicate the failure.
                } else if (rateLimited) {
                    // Still stored, but deliberately not emailed (per-IP limit
                    // exceeded) so the owner's inbox isn't flooded (FIX 1).
                    console.warn("[lead] rate-limited submission stored but NOT emailed — IP " + ip + ", " + rateLimitCount + " submissions in window.");
                    return;
                } else if (isSpam) {
                    console.warn("[lead] spam-flagged submission stored but NOT emailed — reasons: " + spamCheck.reasons.join(",") + ", IP " + ip);
                    return;
                }
                if (!env.RESEND_API_KEY) {
                    console.error("[lead] RESEND_API_KEY is not set — notification email skipped (" + (storedOk ? "lead stored" : "lead NOT stored") + ").");
                    return;
                }
                if (parseRecipients(env.LEAD_NOTIFY_TO).length === 0) {
                    console.error("[lead] LEAD_NOTIFY_TO is not set — notification email skipped (" + (storedOk ? "lead stored" : "lead NOT stored") + ").");
                    return;
                }
                const sent = await sendNotificationEmail(
                    env,
                    row, // server-derived row — email always agrees with the DB (FIX 4)
                    notificationPrefix,
                    warningNotice,
                    storedOk
                );
                if (sent && leadId !== null && storedOk) {
                    await env.DB.prepare("UPDATE leads SET notified = 1 WHERE id = ?").bind(leadId).run();
                }
            } catch (err) {
                console.error("[lead] notification email failed:", err);
            }
        })());

        // g. Redirect — only ever to a same-origin or apex URL (open-redirect safe).
        // If the lead could not be written, never show the thank-you page: the
        // visitor must be told it failed so they can retry. (The honeypot path
        // above returns the success redirect deliberately for bots — FIX D.)
        if (!storedOk) return errorRedirect(request);
        return successRedirect(request, fields);
    } catch (err) {
        // h. Never show the customer a thank-you page after a total failure —
        // if nothing was stored or emailed they must not be told the enquiry
        // arrived. Send them back with ?error=1 so they can retry or phone (FIX D).
        console.error("[lead] unexpected error:", err);
        return errorRedirect(request);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Score a submission against simple bot heuristics. Genuine browser
// submissions always carry the fields js/main.js injects (page_path,
// first_seen_at, lead_created_at); bots POSTing the raw form never do.
// Returns { score, reasons } — spam when score >= 2.
function detectSpam(fields) {
    let score = 0;
    const reasons = [];
    const blank = (key) =>
        fields[key] === undefined || fields[key] === null || String(fields[key]).trim() === "";

    if (blank("page_path") && blank("first_seen_at") && blank("lead_created_at")) {
        score += 2;
        reasons.push("no-js");
    }
    if (/https?:\/\/|www\./i.test(String(fields.message || ""))) {
        score += 1;
        reasons.push("url-in-message");
    }
    if (String(fields.email || "").toLowerCase().endsWith("@thebeatboutique.ie")) {
        score += 2;
        reasons.push("own-domain-email");
    }
    const currentYear = new Date().getUTCFullYear();
    const dateYearMatch = String(fields.wedding_date || "") + " " + String(fields.event_date || "");
    const yearMatch = /\b(19|20)\d{2}\b/.exec(dateYearMatch);
    if (yearMatch && Number(yearMatch[0]) < currentYear) {
        score += 1;
        reasons.push("past-date");
    }
    return { score, reasons };
}

async function collectBody(stream) {
    // Read the request body in chunks, counting bytes, and abort (return null)
    // as soon as the running total exceeds MAX_BODY_BYTES. This enforces the cap
    // on the body stream itself, so a chunked request with no Content-Length
    // header can't bypass it (FIX E).
    if (!stream) return null;
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        let chunk;
        try {
            chunk = await reader.read();
        } catch (err) {
            console.error("[lead] body read failed:", err);
            return null;
        }
        if (chunk.done) break;
        const bytes = chunk.value;
        total += bytes ? bytes.byteLength : 0;
        if (total > MAX_BODY_BYTES) {
            console.error("[lead] body exceeded " + MAX_BODY_BYTES + " bytes during stream read — aborting.");
            try { await reader.cancel(); } catch (_) {}
            return null;
        }
        chunks.push(bytes);
    }
    return concatChunks(chunks);
}

function concatChunks(chunks) {
    const total = chunks.reduce((n, c) => n + c.byteLength, 0);
    let result = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        result.set(c, offset);
        offset += c.byteLength;
    }
    return result.buffer;
}

async function readFields(request) {
    const fields = {};
    let formData;
    try {
        formData = await request.formData();
    } catch (err) {
        console.error("[lead] formData parse failed:", err);
        return null;
    }
    for (const [key, value] of formData.entries()) {
        if (typeof value === "string") {
            fields[key] = value;
        } else if (value && typeof value === "object" && typeof value.name === "string") {
            // File uploads (none of the current forms send one) — keep the name.
            fields[key] = value.name;
        } else {
            fields[key] = String(value);
        }
    }
    return fields;
}

function successRedirect(request, fields) {
    return new Response(null, {
        status: 303,
        headers: { Location: safeRedirectTarget(fields.redirect, request.url) },
    });
}

function errorRedirect(request) {
    // 303 back to the referring page with ?error=1 appended.
    const referer = request.headers.get("Referer");
    if (referer) {
        try {
            const ref = new URL(referer);
            const current = new URL(request.url);
            const isSite =
                ref.hostname === APEX_HOST ||
                ref.hostname === "www." + APEX_HOST ||
                ref.origin === current.origin;
            if (isSite) {
                ref.searchParams.set("error", "1");
                return new Response(null, { status: 303, headers: { Location: ref.toString() } });
            }
        } catch {
            // Unparseable referer — fall through to the site fallback below.
        }
    }
    return new Response(null, {
        status: 303,
        headers: { Location: "https://" + APEX_HOST + "/?error=1" },
    });
}

function safeRedirectTarget(raw, requestUrl) {
    if (typeof raw !== "string" || raw.trim() === "") return SUCCESS_FALLBACK;
    try {
        const target = new URL(raw.trim());
        const current = new URL(requestUrl);
        // Same origin, or https on the apex domain. Nothing else is allowed,
        // which prevents an open redirect.
        const apex = target.protocol === "https:" && target.hostname === APEX_HOST;
        if (apex || target.origin === current.origin) return target.toString();
    } catch {
        // Not parseable as a URL — fall through.
    }
    return SUCCESS_FALLBACK;
}

function capRawJson(fields, maxBytes = MAX_RAW_JSON_BYTES) {
    let json = JSON.stringify(fields);
    if (json === undefined) return "{}";
    if (byteLength(json) <= maxBytes) return json;
    // Extremely unlikely path: shrink the longest string values until the JSON
    // fits under the cap, keeping it valid JSON. Individual values are already
    // capped at 5000 chars.
    const obj = { ...fields };
    while (byteLength(json) > maxBytes) {
        let longestKey = null;
        for (const key of Object.keys(obj)) {
            if (
                typeof obj[key] === "string" &&
                (longestKey === null || obj[key].length > obj[longestKey].length)
            ) {
                longestKey = key;
            }
        }
        if (longestKey === null || obj[longestKey].length === 0) break;
        obj[longestKey] = obj[longestKey].slice(0, Math.floor(obj[longestKey].length / 2));
        json = JSON.stringify(obj);
    }
    return json;
}

function byteLength(str) {
    return new TextEncoder().encode(str).length;
}

function parseRecipients(value) {
    return String(value || "").split(",").map(s => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Notification email (Resend REST API)
// ---------------------------------------------------------------------------

async function sendNotificationEmail(env, fields, notificationPrefix, warningNotice, stored) {
    const { html, text } = buildEmailContent(fields, warningNotice, stored);
    const recipients = parseRecipients(env.LEAD_NOTIFY_TO);
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: "Bearer " + env.RESEND_API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: env.LEAD_NOTIFY_FROM || "The Beat Boutique <leads@send.thebeatboutique.ie>",
            to: recipients,
            reply_to: fields.email, // a reply goes straight to the customer
            subject: notificationPrefix + buildSubject(fields),
            html,
            text,
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[lead] Resend API error " + res.status + ": " + body);
        return false;
    }
    return true;
}

function buildSubject(fields) {
    // Use the submitted subject if present (the site JS sets it), else build one.
    const submitted = typeof fields.subject === "string" ? fields.subject.trim() : "";
    if (submitted) return submitted.slice(0, MAX_FIELD_CHARS);
    const parts = [fields.wedding_date, fields.venue, fields.form_source].filter(
        (v) => typeof v === "string" && v.trim() !== ""
    );
    return parts.length ? "[TBB Lead] " + parts.join(" - ") : "[TBB Lead] New enquiry";
}

function buildEmailContent(fields, warningNotice, stored) {
    // Pull out the values the hero, actions and footer need.
    const names = nonEmptyStr(fields.names);
    const phone = nonEmptyStr(fields.phone);
    const email = nonEmptyStr(fields.email);
    const dateVal = nonEmptyStr(fields.event_date) || nonEmptyStr(fields.wedding_date);
    const venue = nonEmptyStr(fields.venue);
    const message = nonEmptyStr(fields.message);
    const received = formatReceived(fields);

    // Details = the fixed detail fields plus any other submitted field that
    // isn't already rendered (hero / action row), attribution, or internals.
    const detailsKeys = [
        "phone", "email",
        ...DETAIL_FIELDS,
        ...Object.keys(fields).filter(
            (key) =>
                !DETAIL_FIELDS.includes(key) &&
                !HERO_FIELDS.has(key) &&
                !ATTRIBUTION_FIELDS.includes(key) &&
                !INTERNAL_FIELDS.has(key) &&
                isNonEmpty(fields[key])
        ),
    ];
    const detailsHtml = detailsKeys.some((k) => isNonEmpty(fields[k]))
        ? detailsBlock(fields, detailsKeys)
        : "";
    const attributionHtml = attributionRows(fields);
    const warningHtml = warningNotice ? warningBand(warningNotice) : "";

    const html = emailHtml({
        names, phone, email, dateVal, venue, received,
        detailsHtml, attributionHtml, warningHtml, stored,
    });

    const text = emailText({
        fields, warningNotice, names, phone, email, dateVal, venue, message, received, stored,
    });

    return { html, text };
}

// --- HTML builders ---------------------------------------------------------

function emailHtml(o) {
    return "<!DOCTYPE html><html>" +
        "<head><meta charset=\"utf-8\">" +
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
        "<meta name=\"color-scheme\" content=\"light\">" +
        "<meta name=\"supported-color-schemes\" content=\"light\">" +
        "<title>New enquiry — The Beat Boutique</title></head>" +
        "<body style=\"margin:0;padding:0;background:#f4f1ea;\">" +
        "<center>" +
        "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"background:#f4f1ea;\">" +
        "<tr><td align=\"center\" style=\"padding:24px 12px;\">" +
        // White card (the only bordered column) holds header, warning, hero,
        // actions and details.
        "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"max-width:600px;background:#ffffff;\">" +
        headerBand() +
        (o.warningHtml || "") +
        heroBlock(o) +
        actionRowHtml(o.phone, o.email) +
        (o.detailsHtml || "") +
        "</table>" +
        attributionBlock(o.attributionHtml) +
        footerBlock(o.received, o.stored) +
        "</td></tr></table>" +
        "</center></body></html>";
}

function headerBand() {
    return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"background:#0a192f;\">" +
        "<tr><td height=\"3\" style=\"background:#d4af37;height:3px;font-size:0;line-height:0;\">&nbsp;</td></tr>" +
        "<tr><td style=\"background:#0a192f;padding:26px 32px 22px;\">" +
        "<div style=\"font-family:" + FONT_SANS + ";font-size:11px;line-height:1.3;letter-spacing:2px;text-transform:uppercase;color:#d4af37;\">The Beat Boutique</div>" +
        "<div style=\"font-family:" + FONT_SERIF + ";font-size:26px;line-height:1.2;color:#f4f1ea;margin-top:6px;\">New enquiry</div>" +
        "</td></tr></table>";
}

function warningBand(message) {
    const text = escapeHtml(String(message || "").trim());
    return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"background:#ffffff;\">" +
        "<tr><td style=\"background:#b3261e;padding:16px 32px;text-align:left;font-family:" + FONT_SANS + ";font-size:14px;line-height:1.4;font-weight:700;color:#ffffff;white-space:normal;word-break:break-word;\">" + text + "</td></tr></table>";
}

function heroBlock(o) {
    const dateLine = o.dateVal
        ? "<div style=\"margin-top:20px;\">" +
          "<div style=\"font-family:" + FONT_SANS + ";font-size:11px;line-height:1.3;letter-spacing:1px;text-transform:uppercase;color:#b5952f;font-weight:600;\">Date</div>" +
          "<div style=\"font-family:" + FONT_SANS + ";font-size:15px;line-height:1.4;color:#2f3f50;margin-top:2px;\">" + escapeHtml(o.dateVal) + "</div></div>"
        : "";
    const venueLine = o.venue
        ? "<div style=\"margin-top:12px;\">" +
          "<div style=\"font-family:" + FONT_SANS + ";font-size:11px;line-height:1.3;letter-spacing:1px;text-transform:uppercase;color:#b5952f;font-weight:600;\">Venue</div>" +
          "<div style=\"font-family:" + FONT_SANS + ";font-size:15px;line-height:1.4;color:#2f3f50;margin-top:2px;\">" + escapeHtml(o.venue) + "</div></div>"
        : "";
    return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\"><tr>" +
        "<td style=\"background:#ffffff;padding:36px 32px 10px;\">" +
        "<div style=\"font-family:" + FONT_SERIF + ";font-size:30px;line-height:1.2;color:#0a192f;\">" + escapeHtml(o.names || "New enquiry") + "</div>" +
        dateLine + venueLine +
        "</td></tr></table>";
}

// Buttons as table cells (not CSS buttons) so they render in Outlook. Render
// the Call button only when a phone number was supplied; otherwise the email
// button spans the full width.
function actionRowHtml(phone, email) {
    const tel = telHref(phone);
    const mail = mailtoHref(email);
    const callBtnHtml = tel
        ? "<td align=\"center\" width=\"50%\" style=\"padding:6px;\">" +
          "<a href=\"tel:" + tel + "\" style=\"display:block;padding:16px 12px;background:#d4af37;color:#0a192f;font-family:" + FONT_SANS + ";font-size:15px;line-height:1.2;font-weight:700;text-align:center;text-decoration:none;border-radius:6px;white-space:nowrap;\">Call</a></td>"
        : "";
    const emailBtnHtml = mail
        ? "<td align=\"center\" width=\"" + (tel ? "50%" : "100%") + "\" style=\"padding:6px;\">" +
          "<a href=\"mailto:" + mail + "?subject=" + encodeURIComponent("Re: your enquiry — The Beat Boutique") + "\" style=\"display:block;padding:16px 12px;background:#0a192f;color:#f4f1ea;font-family:" + FONT_SANS + ";font-size:15px;line-height:1.2;font-weight:700;text-align:center;text-decoration:none;border-radius:6px;\">Reply by email</a></td>"
        : "";
    return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\"><tr>" +
        "<td style=\"background:#ffffff;padding:16px 26px 4px;\">" +
        "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\"><tr>" +
        callBtnHtml + emailBtnHtml +
        "</tr></table></td></tr></table>";
}

function detailsBlock(fields, keys) {
    return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\"><tr>" +
        "<td style=\"background:#ffffff;padding:8px 32px 28px;\">" +
        "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"border-collapse:collapse;border-top:1px solid #e8e2d5;\">" +
        emailRows(fields, keys) +
        "</table></td></tr></table>";
}

function attributionBlock(rows) {
    if (!rows) return "";
    return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"max-width:600px;background:#f4f1ea;\">" +
        "<tr><td style=\"padding:24px 32px 8px;\">" +
        "<div style=\"font-family:" + FONT_SANS + ";font-size:11px;line-height:1.3;letter-spacing:1px;text-transform:uppercase;color:#8b6b1b;\">Where this lead came from</div>" +
        rows +
        "</td></tr></table>";
}

function footerBlock(received, stored) {
    // When the lead was NOT stored, this email is the only surviving copy — we
    // tell the owner to save it manually instead of linking the (possibly empty)
    // dashboard. When it WAS stored, keep the normal dashboard link.
    const storedLine = stored
        ? "Stored in your <a href=\"https://thebeatboutique.ie/leads/\" style=\"color:#8a97a4;text-decoration:underline;\">lead dashboard</a>"
        : "This lead was NOT stored automatically. This email is the only copy — please save it manually (open the enquiry below and keep it somewhere safe).";
    return "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"max-width:600px;background:#f4f1ea;\">" +
        "<tr><td align=\"center\" style=\"padding:16px 32px 8px;font-family:" + FONT_SANS + ";font-size:11px;line-height:1.6;color:#8a97a4;\">" +
        (received ? "Received " + received + "<br>" : "") +
        storedLine +
        "</td></tr></table>";
}

// --- Row builders ----------------------------------------------------------

function emailRows(fields, keys) {
    return keys
        .filter((key) => isNonEmpty(fields[key]))
        .map(
            (key) =>
                "<tr>" +
                "<td style=\"padding:10px 12px;border-bottom:1px solid #e8e2d5;font-family:" + FONT_SANS + ";font-size:11px;line-height:1.3;letter-spacing:1px;text-transform:uppercase;color:#8b6b1b;font-weight:600;white-space:nowrap;vertical-align:top;\">" +
                escapeHtml(fieldLabel(key)) + "</td>" +
                "<td style=\"padding:10px 12px;border-bottom:1px solid #e8e2d5;font-family:" + FONT_SANS + ";font-size:14px;line-height:1.45;color:#2f3f50;vertical-align:top;word-break:break-word;\">" +
                formatValue(key, fields[key]) + "</td></tr>"
        )
        .join("");
}

function attributionRows(fields) {
    return ATTRIBUTION_FIELDS
        .filter((k) => isNonEmpty(fields[k]))
        .map(
            (k) =>
                "<p style=\"margin:10px 0 0;font-family:" + FONT_SANS + ";font-size:12px;line-height:1.5;color:#5a6b7d;word-break:break-word;\">" +
                "<strong style=\"font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8b6b1b;\">" +
                escapeHtml(fieldLabel(k)) + "</strong>: " +
                escapeHtml(fields[k]) + "</p>"
        )
        .join("");
}

// --- Plain-text version ----------------------------------------------------

function emailText(o) {
    const lines = [];
    if (o.warningNotice) lines.push(o.warningNotice.trim());
    lines.push("THE BEAT BOUTIQUE — new enquiry", "");
    if (o.names) lines.push("Names: " + o.names);
    if (o.dateVal) lines.push("Wedding/event date: " + o.dateVal);
    if (o.venue) lines.push("Venue: " + o.venue);
    if (o.phone) lines.push("Phone: " + o.phone);
    if (o.email) lines.push("Email: " + o.email);
    if (o.message) lines.push("Message: " + o.message);
    const attribution = ATTRIBUTION_FIELDS.filter((k) => isNonEmpty(o.fields[k]));
    if (attribution.length) {
        lines.push("", "WHERE THIS LEAD CAME FROM");
        attribution.forEach((k) => lines.push(fieldLabel(k) + ": " + o.fields[k]));
    }
    if (o.received) {
        lines.push("", "Received " + o.received);
    }
    // When the lead was NOT stored, this email is the only copy — say so instead
    // of pointing at the dashboard. When it WAS stored, keep the normal link.
    if (o.stored) {
        lines.push("Stored in your lead dashboard: https://thebeatboutique.ie/leads/");
    } else {
        lines.push("This lead was NOT stored automatically. This email is the only copy — please save it manually and keep it somewhere safe.");
    }
    return lines.join("\n");
}

// --- Value helpers ---------------------------------------------------------

// Escape first, then (for message only) turn newlines into <br> so escaping is
// never bypassed.
function formatValue(key, value) {
    const escaped = escapeHtml(value);
    if (key === "phone") {
        const tel = telHref(value);
        return tel
            ? "<a href=\"tel:" + tel + "\" style=\"color:#0a192f;text-decoration:underline;\">" + escaped + "</a>"
            : escaped;
    }
    if (key === "email") {
        const mail = mailtoHref(value);
        return mail
            ? "<a href=\"mailto:" + mail + "\" style=\"color:#0a192f;text-decoration:underline;\">" + escaped + "</a>"
            : escaped;
    }
    if (key === "message") return escaped.replace(/\r?\n/g, "\n").replace(/\n/g, "<br>");
    return escaped;
}

// Human-readable Irish-local timestamp. Prefers the server-generated created_at
// (so a visitor's mis-set clock can't show a lead as days old or in the future),
// falling back to the submitted lead_created_at only when created_at is missing
// or unparseable (FIX 5).
function formatReceived(fields) {
    const raw = isNonEmpty(fields.created_at)
        ? fields.created_at
        : (isNonEmpty(fields.lead_created_at) ? fields.lead_created_at : null);
    if (!raw) return "";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "";
    const datePart = d.toLocaleString("en-IE", {
        timeZone: "Europe/Dublin",
        weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    const timePart = d.toLocaleString("en-IE", {
        timeZone: "Europe/Dublin",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
    return (datePart + ", " + timePart).trim();
}

function nonEmptyStr(value) {
    return isNonEmpty(value) ? String(value).trim() : "";
}

function isNonEmpty(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
}

function fieldLabel(key) {
    return LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function telHref(raw) {
    const cleaned = String(raw || "").replace(/[^0-9+()\-]/g, "");
    return escapeHtml(cleaned);
}

function mailtoHref(raw) {
    const cleaned = String(raw || "").replace(/[^A-Za-z0-9._%+\-@]/g, "");
    return escapeHtml(cleaned);
}
