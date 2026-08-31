// GET /leads/export — full CSV export of every lead (password-protected).
// Same HTTP Basic auth as the /leads dashboard (env.LEADS_PASSWORD, any
// username, constant-time comparison). Values are escaped for quotes, commas
// and newlines.

const EXPORT_COLUMNS = [
    "id", "created_at",
    "names", "email", "phone", "wedding_date", "event_date", "venue",
    "message", "how_found", "interest",
    "subject", "form_source", "form_id", "lead_type",
    "page_url", "page_path", "page_category", "page_focus", "landing_page",
    "referrer", "first_referrer", "first_seen_at",
    "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    "gclid", "fbclid",
    "first_utm_source", "first_utm_medium", "first_utm_campaign",
    "first_utm_content", "first_utm_term", "first_gclid", "first_fbclid",
    "lead_created_at",
    "ip", "country", "user_agent", "notified", "raw_json",
];

export async function onRequestGet(context) {
    const { request, env } = context;
    if (!checkAuth(request, env)) return unauthorized();

    try {
        const { results } = await env.DB.prepare(
            "SELECT * FROM leads ORDER BY created_at DESC"
        ).all();

        const lines = [EXPORT_COLUMNS.map(csvCell).join(",")];
        for (const row of results || []) {
            lines.push(EXPORT_COLUMNS.map((col) => csvCell(row[col])).join(","));
        }
        const csv = lines.join("\r\n");

        const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        return new Response(csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": 'attachment; filename="tbb-leads-' + date + '.csv"',
            },
        });
    } catch (err) {
        console.error("[leads] export error:", err);
        return new Response("Export error — check function logs.", { status: 500 });
    }
}

function csvCell(value) {
    if (value === null || value === undefined) return '""';
    return '"' + String(value).replace(/"/g, '""') + '"';
}

// ---------------------------------------------------------------------------
// Auth (same as /leads dashboard)
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
