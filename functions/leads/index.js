// GET /leads — password-protected lead dashboard.
// HTTP Basic auth against env.LEADS_PASSWORD (any username), compared in
// constant time. Shows the 200 most recent leads, newest first.
//
// Bindings (configured via the Cloudflare API, not wrangler.toml):
//   env.DB             — D1 database
//   env.LEADS_PASSWORD — password for the /leads dashboard and /leads/export

export async function onRequestGet(context) {
    const { request, env } = context;
    const expected = env.LEADS_PASSWORD;
    if (typeof expected !== "string" || expected === "") {
        return new Response("Leads dashboard is not configured: set the LEADS_PASSWORD secret.", { status: 503 });
    }
    if (!checkAuth(request, env)) return unauthorized();

    try {
        const showSpam = new URL(request.url).searchParams.get("spam") === "1";
        const totalRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM leads WHERE spam = 0").first();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const recentRow = await env.DB.prepare(
            "SELECT COUNT(*) AS c FROM leads WHERE spam = 0 AND created_at >= ?"
        ).bind(thirtyDaysAgo).first();
        const spamRow = await env.DB.prepare("SELECT COUNT(*) AS c FROM leads WHERE spam = 1").first();
        const { results } = await env.DB.prepare(
            "SELECT * FROM leads" + (showSpam ? "" : " WHERE spam = 0") + " ORDER BY created_at DESC LIMIT 200"
        ).all();

        const page = renderDashboard({
            total: totalRow ? totalRow.c : 0,
            last30: recentRow ? recentRow.c : 0,
            spamCount: spamRow ? spamRow.c : 0,
            showSpam,
            leads: results || [],
        });
        return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    } catch (err) {
        console.error("[leads] dashboard error:", err);
        return new Response("Dashboard error — check function logs.", { status: 500 });
    }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function unauthorized() {
    return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="TBB Leads"' },
    });
}

function checkAuth(request, env) {
    const header = request.headers.get("Authorization") || "";
    const match = /^Basic\s+(.+)$/.exec(header);
    if (!match) return false;
    let decoded;
    try {
        decoded = atob(match[1]);
    } catch {
        return false;
    }
    const colon = decoded.indexOf(":");
    if (colon === -1) return false;
    // Any username is accepted; only the password is compared.
    const password = decoded.slice(colon + 1);
    if (password === "") return false;
    const expected = env.LEADS_PASSWORD;
    if (typeof expected !== "string" || expected === "") return false;
    return timingSafeEqual(password, expected);
}

function timingSafeEqual(a, b) {
    const maxLen = Math.max(a.length, b.length);
    let diff = a.length ^ b.length;
    for (let i = 0; i < maxLen; i += 1) {
        diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
}

// ---------------------------------------------------------------------------
// Rendering (self-contained HTML, inline CSS only, no external assets)
// ---------------------------------------------------------------------------

function renderDashboard({ total, last30, spamCount, showSpam, leads }) {
    const rows = leads
        .map(
            (lead) =>
                "<tr>" +
                (Number(lead.spam)
                    ? "<td class=\"mono\" title=\"Stored but not emailed (spam): " + escapeHtml(lead.spam_reason || "") + "\">" +
                      (Number(lead.rate_limited) ? "<span class=\"rl\">LIMIT</span>" : "") +
                      "<span class=\"spam\">SPAM</span>" + escapeHtml(formatWhen(lead.created_at)) + "</td>"
                    : Number(lead.rate_limited)
                    ? "<td class=\"mono\" title=\"Stored but not emailed (per-IP limit exceeded).\"><span class=\"rl\">LIMIT</span>" + escapeHtml(formatWhen(lead.created_at)) + "</td>"
                    : "<td class=\"mono\" title=\"" + escapeHtml(lead.created_at || "") + "\">" + escapeHtml(formatWhen(lead.created_at)) + "</td>") +
                "<td>" + escapeHtml(lead.names) + "</td>" +
                "<td>" + escapeHtml(lead.email) + "</td>" +
                "<td>" + escapeHtml(lead.phone) + "</td>" +
                "<td>" + escapeHtml(lead.wedding_date) + "</td>" +
                "<td>" + escapeHtml(lead.venue) + "</td>" +
                "<td>" + escapeHtml(lead.form_source) + "</td>" +
                "<td>" + escapeHtml(lead.utm_source) + "</td>" +
                "<td>" + escapeHtml(lead.lead_type) + "</td>" +
                "</tr>" +
                (isNonEmpty(lead.message)
                    ? "<tr class=\"msg-row\"><td colspan=\"9\"><details><summary>Message</summary><div class=\"msg\">" +
                      escapeHtml(lead.message) +
                      "</div></details></td></tr>"
                    : "")
        )
        .join("");

    const body =
        leads.length === 0
            ? "<tr><td colspan=\"9\" class=\"empty\">No leads yet.</td></tr>"
            : rows;

    return (
        "<!DOCTYPE html>" +
        '<html lang="en"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        "<title>TBB Leads</title>" +
        "<style>" +
        "*{box-sizing:border-box}" +
        "body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f6f8;color:#1a2332}" +
        "header{background:#0d1b2a;color:#fff;padding:20px 24px}" +
        "header h1{margin:0 0 6px;font-size:20px}" +
        "header p{margin:0;opacity:.85;font-size:13px}" +
        "header a{color:#8ecdf7}" +
        "main{padding:24px;max-width:1400px;margin:0 auto}" +
        ".stats{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}" +
        ".stat{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:14px 18px;min-width:160px}" +
        ".stat b{display:block;font-size:26px;line-height:1.2}" +
        ".stat span{font-size:13px;color:#5a6b7d}" +
        ".table-wrap{background:#fff;border:1px solid #dfe5ec;border-radius:10px;overflow-x:auto}" +
        "table{border-collapse:collapse;width:100%;min-width:960px;font-size:13px}" +
        "th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #e8edf2;vertical-align:top}" +
        "th{background:#f0f3f7;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#4a5a6c}" +
        "tr:hover td{background:#f8fafc}" +
        "td.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:nowrap}" +
        ".rl{display:inline-block;background:#b3261e;color:#fff;font-size:10px;font-weight:700;line-height:1;padding:3px 5px;border-radius:4px;margin-right:6px;vertical-align:1px}" +
        ".spam{display:inline-block;background:#8a6d00;color:#fff;font-size:10px;font-weight:700;line-height:1;padding:3px 5px;border-radius:4px;margin-right:6px;vertical-align:1px}" +
        "details{margin-top:2px}summary{cursor:pointer;color:#0d6efd;font-size:12px;user-select:none}" +
        ".msg{white-space:pre-wrap;background:#f7f9fb;border:1px solid #e2e8ef;border-radius:8px;padding:10px 12px;margin-top:6px}" +
        ".empty{padding:40px;text-align:center;color:#5a6b7d}" +
        "</style></head><body>" +
        "<header><h1>The Beat Boutique — Leads</h1>" +
        "<p>" + total + " total &middot; " + last30 + " in the last 30 days &middot; " +
        (showSpam
            ? '<a href="/leads/">Hide spam</a>'
            : '<a href="/leads/?spam=1">Show spam</a>') + " &middot; " +
        '<a href="/leads/export">Export all as CSV</a> &middot; times shown in UTC &middot; ' +
        '<span class="rl">LIMIT</span> = stored but not emailed (per-IP limit exceeded) &middot; ' +
        '<span class="spam">SPAM</span> = stored but not emailed (bot heuristics)</p></header>' +
        '<main><div class="stats">' +
        '<div class="stat"><b>' + total + "</b><span>Total leads</span></div>" +
        '<div class="stat"><b>' + last30 + "</b><span>Last 30 days</span></div>" +
        '<div class="stat"><b>' + spamCount + "</b><span>Spam (hidden)</span></div>" +
        "</div>" +
        '<div class="table-wrap"><table><thead><tr>' +
        "<th>Date</th><th>Names</th><th>Email</th><th>Phone</th><th>Wedding date</th>" +
        "<th>Venue</th><th>Source</th><th>UTM source</th><th>Lead type</th>" +
        "</tr></thead><tbody>" + body + "</tbody></table></div>" +
        "</main></body></html>"
    );
}

function formatWhen(iso) {
    if (!iso) return "—";
    return String(iso).replace("T", " ").slice(0, 16);
}

function isNonEmpty(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
}

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
