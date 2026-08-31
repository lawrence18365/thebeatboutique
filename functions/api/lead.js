// POST /api/lead — self-hosted lead intake for The Beat Boutique.
// Replaces the dead Formspark endpoint. Order of operations matters: the lead is
// written to D1 BEFORE anything that can fail (notification email, etc.) so no
// submission is ever lost.
//
// Bindings (configured via the Cloudflare API, not wrangler.toml):
//   env.DB              — D1 database (bound as `DB`)
//   env.RESEND_API_KEY  — Resend API key (optional: email is skipped without it)
//   env.LEAD_NOTIFY_TO  — notification recipient address
//   env.LEAD_NOTIFY_FROM — notification sender address (optional, sensible default)
//   env.LEADS_PASSWORD  — used by the /leads dashboard, not here

const SUCCESS_FALLBACK = "https://thebeatboutique.ie/thank-you/";
const APEX_HOST = "thebeatboutique.ie";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD_CHARS = 5000;                 // cap on every individual value
const MAX_RAW_JSON_BYTES = 64 * 1024;         // cap on the whole raw_json payload
const RATE_LIMIT_MAX = 8;                     // max submissions per IP per window
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

// Fields shown in the notification email, grouped "Enquiry" then "Attribution".
const ENQUIRY_FIELDS = [
    "names", "email", "phone", "wedding_date", "venue", "message", "how_found",
];
const ATTRIBUTION_FIELDS = [
    "form_source", "page_path",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "gclid", "fbclid", "referrer", "landing_page",
];
// Plumbing fields that never appear in the email.
const INTERNAL_FIELDS = new Set(["_gotcha", "redirect", "raw_json"]);

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
        const fields = await readFields(request);

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

        // d+e. Rate limit + INSERT — both isolated in their own try/catch. If the
        // rate-limit COUNT query or the INSERT fails, log it and keep going so no
        // genuine enquiry is ever dropped (the email may still fire).
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
            raw_json: capRawJson(fields),
        };
        const allColumns = ["created_at", ...LEAD_COLUMNS, "ip", "country", "user_agent", "raw_json"];
        const sql = `INSERT INTO leads (${allColumns.join(", ")}) VALUES (${allColumns.map(() => "?").join(", ")})`;
        const values = allColumns.map((col) => {
            const v = row[col];
            return v === undefined || v === null ? null : String(v);
        });
        let leadId = null;
        let storedOk = false;
        try {
            const countRow = await env.DB.prepare(
                "SELECT COUNT(*) AS c FROM leads WHERE ip = ? AND created_at >= ?"
            ).bind(ip, since).first();
            if ((countRow && countRow.c) >= RATE_LIMIT_MAX) {
                return successRedirect(request, fields);
            }
            const insert = await env.DB.prepare(sql).bind(...values).run();
            if (insert.meta && insert.meta.last_row_id !== undefined) {
                leadId = insert.meta.last_row_id;
            }
            storedOk = true;
        } catch (err) {
            console.error("[lead] rate-limit/insert failed:", err);
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
                if (!env.RESEND_API_KEY) {
                    console.error("[lead] RESEND_API_KEY is not set — notification email skipped (" + (storedOk ? "lead stored" : "lead NOT stored") + ").");
                    return;
                }
                if (!env.LEAD_NOTIFY_TO) {
                    console.error("[lead] LEAD_NOTIFY_TO is not set — notification email skipped (" + (storedOk ? "lead stored" : "lead NOT stored") + ").");
                    return;
                }
                const sent = await sendNotificationEmail(env, fields, notificationPrefix, warningNotice);
                if (sent && leadId !== null && storedOk) {
                    await env.DB.prepare("UPDATE leads SET notified = 1 WHERE id = ?").bind(leadId).run();
                }
            } catch (err) {
                console.error("[lead] notification email failed:", err);
            }
        })());

        // g. Redirect — only ever to a same-origin or apex URL (open-redirect safe).
        return successRedirect(request, fields);
    } catch (err) {
        // h. Never show the customer a 500 after they filled in a form.
        console.error("[lead] unexpected error:", err);
        return new Response(null, { status: 303, headers: { Location: SUCCESS_FALLBACK } });
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readFields(request) {
    const fields = {};
    const formData = await request.formData();
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

// ---------------------------------------------------------------------------
// Notification email (Resend REST API)
// ---------------------------------------------------------------------------

async function sendNotificationEmail(env, fields, notificationPrefix, warningNotice) {
    const { html, text } = buildEmailContent(fields, warningNotice);
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: "Bearer " + env.RESEND_API_KEY,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: env.LEAD_NOTIFY_FROM || "The Beat Boutique <leads@send.thebeatboutique.ie>",
            to: env.LEAD_NOTIFY_TO,
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

function buildEmailContent(fields, warningNotice) {
    // "Enquiry" group: the listed fields plus any other submitted field that
    // isn't attribution or plumbing, so every non-empty field is shown.
    const enquiryKeys = [
        ...ENQUIRY_FIELDS,
        ...Object.keys(fields).filter(
            (key) =>
                !ENQUIRY_FIELDS.includes(key) &&
                !ATTRIBUTION_FIELDS.includes(key) &&
                !INTERNAL_FIELDS.has(key) &&
                isNonEmpty(fields[key])
        ),
    ];
    const enquiryHtml = emailRows(fields, enquiryKeys);
    const attributionHtml = emailRows(fields, ATTRIBUTION_FIELDS);

    const warningHtml = warningNotice
        ? "<div style=\"margin:0 0 20px;padding:12px 16px;background:#fff3cd;border:1px solid #d8c24a;border-radius:8px;color:#7a5c00;font-weight:700;\">" + escapeHtml(warningNotice.replace(/\n/g, " ")) + "</div>"
        : "";

    const html =
        "<!DOCTYPE html><html><body style=\"margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2332;\">" +
        "<div style=\"max-width:640px;margin:0 auto;padding:24px;\">" +
        warningHtml +
        "<h2 style=\"color:#0d1b2a;margin:0 0 4px;\">New lead — The Beat Boutique</h2>" +
        "<p style=\"margin:0 0 20px;color:#5a6b7d;font-size:13px;\">Received " + escapeHtml(fields.lead_created_at || "") + "</p>" +
        "<h3 style=\"margin:20px 0 8px;color:#0d1b2a;\">Enquiry</h3>" +
        "<table style=\"border-collapse:collapse;width:100%;background:#ffffff;border:1px solid #dfe5ec;border-radius:8px;\">" + enquiryHtml + "</table>" +
        "<h3 style=\"margin:20px 0 8px;color:#0d1b2a;\">Attribution</h3>" +
        "<table style=\"border-collapse:collapse;width:100%;background:#ffffff;border:1px solid #dfe5ec;border-radius:8px;\">" + attributionHtml + "</table>" +
        "</div></body></html>";

    const textLines = warningNotice ? [warningNotice.trim()] : [];
    textLines.push("New lead — The Beat Boutique", "", "ENQUIRY");
    enquiryKeys.filter((k) => isNonEmpty(fields[k])).forEach((k) => textLines.push(fieldLabel(k) + ": " + fields[k]));
    textLines.push("", "ATTRIBUTION");
    ATTRIBUTION_FIELDS.filter((k) => isNonEmpty(fields[k])).forEach((k) => textLines.push(fieldLabel(k) + ": " + fields[k]));

    return { html, text: textLines.join("\n") };
}

function emailRows(fields, keys) {
    return keys
        .filter((key) => isNonEmpty(fields[key]))
        .map(
            (key) =>
                "<tr>" +
                "<td style=\"padding:8px 12px;border-bottom:1px solid #eef1f5;font-weight:600;white-space:nowrap;vertical-align:top;color:#33414f;font-size:13px;\">" +
                escapeHtml(fieldLabel(key)) + "</td>" +
                "<td style=\"padding:8px 12px;border-bottom:1px solid #eef1f5;vertical-align:top;color:#1a2332;font-size:13px;word-break:break-word;\">" +
                escapeHtml(fields[key]) + "</td></tr>"
        )
        .join("");
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
