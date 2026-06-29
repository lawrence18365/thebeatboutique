# True 301 redirects for thebeatboutique.ie

## Actual architecture (verified 2026-06-29)
- **Production origin is GitHub Pages** (`x-github-request-id`, `via: 1.1 varnish`,
  `x-fastly-request-id` in responses; GitHub Pages API shows cname `thebeatboutique.ie`,
  source `main` branch). GitHub Pages has **no server-side redirect support** — `_redirects`
  and Cloudflare Pages Functions are ignored; **meta-refresh stub HTML is its only redirect
  mechanism** (which is what the repo's stub pages are).
- **Cloudflare proxies the domain's DNS** in front (`cf-ray`, `server: cloudflare`; apex A
  records are Cloudflare IPs). So Cloudflare runs at the edge *before* the GitHub Pages origin.
- The repo ALSO deploys to **Cloudflare Pages** (`.github/workflows/deploy-cloudflare-pages.yml`),
  reachable at `*.thebeatboutique.pages.dev`. There, `_redirects`-style routing and the
  `functions/_middleware.js` in this repo **do** produce true 301s (verified on the preview:
  `/playlist -> /song-list/`, `/wedding-band-cork -> /locations/wedding-band-cork/`). The public
  domain just isn't pointed at it.

So today every redirect on the live domain is a **soft meta-refresh** (HTTP 200 + `<meta refresh>`)
or Cloudflare trailing-slash normalization. There is no hard 301. Quant: legacy source URLs still
draw ~**1,699 impressions / 32 clicks per year** (e.g. `/playlist` at pos 8) instead of their
canonical targets — modest but real link-equity leakage.

## Three ways forward

### Option A — Move the custom domain to Cloudflare Pages (best long-term, repo-controlled)
The repo already deploys to the Cloudflare Pages project `thebeatboutique`, and the
`functions/_middleware.js` here does the 301s (proven on preview). Switch the origin:
1. Cloudflare dashboard → **Workers & Pages → thebeatboutique → Custom domains → Set up a
   custom domain →** `thebeatboutique.ie` (and `www`). Cloudflare wires the DNS automatically.
2. GitHub repo → **Settings → Pages →** remove the custom domain (unset), to stop GitHub Pages
   answering for it. Keep the `CNAME` file only if GitHub Pages is fully retired; otherwise delete it.
3. Verify (below). After this, `_redirects`, `_headers`, and Functions are all repo-controlled and
   the meta-refresh stubs can be deleted.
- Trade-off: a domain cutover (small, brief). Removes the confusing dual-deploy.

### Option B — Cloudflare Redirect Rules / Bulk Redirects (keep GitHub Pages origin)
Because Cloudflare proxies the domain, edge redirects run before GitHub Pages.
1. Cloudflare dashboard → account → **Bulk Redirects → Create a redirect list**, name `tbb-301s`,
   upload **`output/cloudflare-bulk-redirects.csv`** (columns `source,target,status`; 84 rows;
   no chains).
2. Create the **Bulk Redirect Rule** that uses the list. Deploy.
   - (Optional) the county family can instead be one **Redirect Rule** — run
     `node scripts/generate-cloudflare-redirects.js` and copy the printed expression; keep the
     `/wedding-band-prices -> /pricing-guide/` row from the List as the exception.
- Trade-off: redirects live in the Cloudflare dashboard, not the repo.

### Option C — Do nothing (status quo)
Meta-refresh stubs keep working; Google tolerates them. Given only ~32 clicks/yr flow through
them, this is a legitimate "not worth it" choice.

## Verify after Option A or B
```
curl -sI https://thebeatboutique.ie/playlist            # expect 301 -> /song-list/ (single hop)
curl -sI https://thebeatboutique.ie/wedding-band-cork   # expect 301 -> /locations/wedding-band-cork/
curl -sI https://thebeatboutique.ie/wedding-band-prices # expect 301 -> /pricing-guide/
curl -sI https://thebeatboutique.ie/venues/kilshane-house/  # expect 200 (must NOT redirect)
```

## After a true-301 layer is live — cleanup (not before)
The meta-refresh stub directories and the dead `_redirects` file become redundant and can be
removed. Until then, leave them — they are the only thing stopping those URLs from 404-ing.
