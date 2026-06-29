# True 301 redirects for thebeatboutique.ie

## The problem (verified)
The repo's `_redirects` file is **not honored** by this Cloudflare Pages deployment.
Proof: a temporary rule `/zz-redirects-probe /about/ 301` was deployed (deploy succeeded),
then `https://thebeatboutique.ie/zz-redirects-probe` returned **HTTP 404** instead of a 301 —
in both slash and no-slash forms — while `/about/` itself returned 200. Separately, `/home`
301s to `/home/` (Cloudflare auto-trailing-slash to the stub page), **not** to its `_redirects`
target `/`.

Conclusion: every legacy and county redirect currently works only via:
1. meta-refresh **stub HTML pages** (`/wedding-band-cork/index.html` etc.) — these are *soft*
   redirects (HTTP 200 + `<meta http-equiv="refresh">`), weaker than a 301; and
2. Cloudflare's automatic trailing-slash normalization (a real 301, but only slash↔no-slash).

So there is **no hard-301 layer**. `/wedding-band-cork` today does: `301 →/wedding-band-cork/`
→ `200` meta-refresh → `/locations/wedding-band-cork/` (a chain ending in a soft redirect).

The repo side is fine (`_redirects` is valid ASCII at the deploy root, not gitignored, no
`wrangler.toml`/`_routes.json` overriding it). The cause is on the Cloudflare project/account
side and must be fixed in the dashboard.

## The fix (Cloudflare dashboard — ~15 min)
Cloudflare **Bulk Redirects** and **Redirect Rules** run at the edge *before* Pages serves
anything, so they produce true 301s and make the stub pages redundant.

### Option A — Bulk Redirect List (recommended, covers everything)
1. Cloudflare Dashboard → your account → **Bulk Redirects** → **Create a redirect list**.
2. Name it e.g. `tbb-301s`. Upload **`output/cloudflare-bulk-redirects.csv`**
   (columns: `source,target,status`; 84 rows = 42 paths × slash/no-slash; no chains).
3. Create a **Bulk Redirect Rule** that uses the list (Dashboard → Bulk Redirects → the list
   → "Create rule", or Rules → Redirects). Deploy.

### Option B — county family as one Redirect Rule (optional, instead of the 34 county rows)
Dashboard → the **thebeatboutique.ie zone** → **Rules → Redirect Rules → Create rule**:
- If: `(http.host eq "thebeatboutique.ie" and http.request.uri.path matches "^/wedding-band-(dublin|wicklow|meath|kildare|louth|westmeath|wexford|kilkenny|waterford|cork|kerry|limerick|tipperary|clare|galway|mayo|donegal)/?$")`
- Then: Dynamic redirect → 301 → expression `concat("https://thebeatboutique.ie/locations", http.request.uri.path, "/")`, preserve query string ON.
- Keep `/wedding-band-prices → /pricing-guide/` from the List (it's the exception; the broad
  regex must not catch it).

Regenerate the CSV anytime with: `node scripts/generate-cloudflare-redirects.js`

## Verify after applying
```
curl -sI https://thebeatboutique.ie/wedding-band-cork   # expect: 301 -> /locations/wedding-band-cork/
curl -sI https://thebeatboutique.ie/playlist            # expect: 301 -> /song-list/
curl -sI https://thebeatboutique.ie/wedding-band-prices # expect: 301 -> /pricing-guide/
```
Each should be a **single** 301 straight to the final target (no chain, no 200 meta-refresh).

## After it's live — cleanup (do NOT do before)
Once the edge 301s are confirmed live, the meta-refresh stub directories
(`/wedding-band-<county>/`, `/playlist/`, `/contact/`, etc.) and the dead `_redirects` file
become redundant and can be removed. Until then, **leave them** — they are the only thing
keeping those URLs from 404-ing.
