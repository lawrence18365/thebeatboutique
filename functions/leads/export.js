// GET /leads/export — full CSV export of every lead (password-protected).
// Same HTTP Basic auth as the /leads dashboard (env.LEADS_PASSWORD, any
// username, constant-time comparison). Values are escaped for quotes, commas
// and newlines, and formula-prefix characters are neutralised. The export
// pages through the table in batches and streams each batch, so memory stays
// flat regardless of row count (FIX 6).

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
    "ip", "country", "user_agent", "notified", "rate_limited", "raw_json",
];

const EXPORT_BATCH_SIZE = 500;

export async function onRequestGet(context) {
    const { request, env } = context;
    if (!checkAuth(request, env)) return unauthorized();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            try {
                let lastId = 0;
                let wroteHeader = false;
                while (true) {
                    const { results } = await env.DB.prepare(
                        "SELECT * FROM leads WHERE id > ? ORDER BY id ASC LIMIT ?"
                    ).bind(lastId, EXPORT_BATCH_SIZE).all();
                    const batch = results || [];
                    if (!wroteHeader) {
                        controller.enqueue(
                            encoder.encode(EXPORT_COLUMNS.map(csvCell).join(",") + "\r\n")
                        );
                        wroteHeader = true;
                    }
                    if (batch.length === 0) {
                        controller.close();
                        return;
                    }
                    let chunk = "";
                    for (const row of batch) {
                        chunk += EXPORT_COLUMNS.map((col) => csvCell(row[col])).join(",") + "\r\n";
                    }
                    controller.enqueue(encoder.encode(chunk));
                    lastId = batch[batch.length - 1].id;
                    if (batch.length < EXPORT_BATCH_SIZE) {
                        controller.close();
                        return;
                    }
                }
            } catch (err) {
                console.error("[leads] export error:", err);
                controller.error(err);
            }
        },
    });

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return new Response(stream, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="tbb-leads-' + date + '.csv"',
        },
    });
}

// Neutralise CSV formula injection (FIX 6): when a value starts with '=', '+',
// '-', '@', TAB (0x09) or CR (0x0D), prefix it with a single apostrophe inside
// the quoted cell so Excel/LibreOffice/Sheets treat it as text, not a formula.
// Existing quote-doubling is preserved.
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;
function csvCell(value) {
    if (value === null || value === undefined) return '""';
    let str = String(value);
    if (CSV_FORMULA_PREFIX.test(str)) str = "'" + str;
    return '"' + str.replace(/"/g, '""') + '"';
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
