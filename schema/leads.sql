-- D1 schema for The Beat Boutique lead intake (replaces Formspark).
-- Apply via the Cloudflare API (D1 dashboard / wrangler) — there is no wrangler.toml in this repo.
-- `raw_json` stores the full JSON of every submitted field, so nothing is ever lost
-- even if a field is added to a form later.

CREATE TABLE IF NOT EXISTS leads (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at           TEXT    NOT NULL,               -- ISO8601, server-generated
    names                TEXT,
    email                TEXT,
    phone                TEXT,
    wedding_date         TEXT,
    event_date           TEXT,
    venue                TEXT,
    message              TEXT,
    how_found            TEXT,
    interest             TEXT,
    subject              TEXT,
    form_source          TEXT,
    form_id              TEXT,
    lead_type            TEXT,
    page_url             TEXT,
    page_path            TEXT,
    page_category        TEXT,
    page_focus           TEXT,
    landing_page         TEXT,
    referrer             TEXT,
    first_referrer       TEXT,
    first_seen_at        TEXT,
    utm_source           TEXT,
    utm_medium           TEXT,
    utm_campaign         TEXT,
    utm_content          TEXT,
    utm_term             TEXT,
    gclid                TEXT,
    fbclid               TEXT,
    first_utm_source     TEXT,
    first_utm_medium     TEXT,
    first_utm_campaign   TEXT,
    first_utm_content    TEXT,
    first_utm_term       TEXT,
    first_gclid          TEXT,
    first_fbclid         TEXT,
    lead_created_at      TEXT,
    ip                   TEXT,
    country              TEXT,
    user_agent           TEXT,
    notified             INTEGER NOT NULL DEFAULT 0,     -- 1 once the notification email succeeded
    raw_json             TEXT    NOT NULL                -- full JSON of every submitted field
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_email      ON leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_lead_type  ON leads (lead_type);
