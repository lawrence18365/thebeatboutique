#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const EXCLUDED_DIRS = new Set([".git", ".codex", "node_modules"]);
const EXPECTED_INSTAGRAM_USER = "thebeatboutiqueweddingband";
const EXPECTED_FACEBOOK_USER = "thebeatboutiqueband";
const EXTERNAL_TIMEOUT_MS = 10000;
const EXTERNAL_CONCURRENCY = 8;

const hrefRegex = /<a\b[^>]*\bhref\s*=\s*(['"])(.*?)\1/gi;
const baseHrefRegex = /<base\b[^>]*\bhref\s*=\s*(['"])(.*?)\1/i;

function collectHtmlFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (EXCLUDED_DIRS.has(entry.name)) {
            continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectHtmlFiles(fullPath, files);
            continue;
        }
        if (entry.isFile() && entry.name.endsWith(".html")) {
            files.push(fullPath);
        }
    }
    return files;
}

function toSitePath(absolutePath) {
    return path.relative(ROOT_DIR, absolutePath).split(path.sep).join("/");
}

function normalizeInternalPath(href) {
    return href.trim().split("#")[0].split("?")[0];
}

function extractBaseHref(html) {
    const match = html.match(baseHrefRegex);
    if (!match) {
        return "/";
    }
    return match[2].trim() || "/";
}

function extractUsername(pathname) {
    const segments = pathname.split("/").filter(Boolean);
    if (!segments.length) {
        return "";
    }
    return segments[0].toLowerCase();
}

function resolveInternalTarget(filePath, baseHref, href) {
    const rawPath = normalizeInternalPath(href);
    if (!rawPath || rawPath === ".") {
        return [];
    }

    const fromRoot = (() => {
        if (rawPath.startsWith("/")) {
            return path.resolve(ROOT_DIR, `.${rawPath}`);
        }
        if (baseHref.startsWith("/")) {
            return path.resolve(ROOT_DIR, `.${path.posix.join(baseHref, rawPath)}`);
        }
        return path.resolve(path.dirname(filePath), rawPath);
    })();

    if (!path.extname(rawPath) || rawPath.endsWith("/")) {
        return [
            path.join(fromRoot, "index.html"),
            `${fromRoot}.html`,
        ];
    }

    return [fromRoot];
}

async function checkExternalUrl(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);
    const options = {
        redirect: "follow",
        signal: controller.signal,
        headers: {
            "user-agent": "TheBeatBoutiqueLinkAudit/1.0",
        },
    };

    try {
        const headRes = await fetch(url, { ...options, method: "HEAD" });
        if (headRes.status >= 200 && headRes.status < 400) {
            return { ok: true, status: headRes.status, method: "HEAD" };
        }
        if (headRes.status !== 405 && headRes.status !== 403 && headRes.status !== 429) {
            return { ok: false, status: headRes.status, method: "HEAD" };
        }

        const getRes = await fetch(url, { ...options, method: "GET" });
        if (getRes.status >= 200 && getRes.status < 400) {
            return { ok: true, status: getRes.status, method: "GET" };
        }
        return { ok: false, status: getRes.status, method: "GET" };
    } catch (error) {
        return { ok: false, error: error.message };
    } finally {
        clearTimeout(timeout);
    }
}

async function runWithConcurrency(items, concurrency, worker) {
    const results = [];
    let current = 0;

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (current < items.length) {
            const index = current;
            current += 1;
            results[index] = await worker(items[index]);
        }
    });

    await Promise.all(runners);
    return results;
}

async function main() {
    if (typeof fetch !== "function") {
        console.error("This script requires Node.js 18+ (global fetch is missing).");
        process.exit(1);
    }

    const htmlFiles = collectHtmlFiles(ROOT_DIR);
    const issues = [];
    const externalUrls = new Map();
    let totalLinks = 0;

    for (const filePath of htmlFiles) {
        const html = fs.readFileSync(filePath, "utf8");
        const baseHref = extractBaseHref(html);
        const fileIssues = [];
        const links = [...html.matchAll(hrefRegex)];

        for (const link of links) {
            const href = link[2].trim();
            totalLinks += 1;
            if (!href || /^(#|mailto:|tel:|javascript:|data:)/i.test(href)) {
                continue;
            }

            const externalHref = href.startsWith("//") ? `https:${href}` : href;
            if (/^https?:\/\//i.test(externalHref)) {
                let url;
                try {
                    url = new URL(externalHref);
                } catch {
                    fileIssues.push(`Invalid external URL: ${href}`);
                    continue;
                }

                const host = url.hostname.toLowerCase();
                const username = extractUsername(url.pathname);

                if (host.includes("linkedin.com")) {
                    fileIssues.push(`LinkedIn URL is not allowed: ${href}`);
                }

                if (host.includes("instagram.com") && username !== EXPECTED_INSTAGRAM_USER) {
                    fileIssues.push(`Instagram URL must use @${EXPECTED_INSTAGRAM_USER}: ${href}`);
                }

                if (host.includes("facebook.com") && username && username !== EXPECTED_FACEBOOK_USER) {
                    fileIssues.push(`Facebook URL must use /${EXPECTED_FACEBOOK_USER}: ${href}`);
                }

                if (!externalUrls.has(externalHref)) {
                    externalUrls.set(externalHref, []);
                }
                externalUrls.get(externalHref).push(toSitePath(filePath));
                continue;
            }

            const candidatePaths = resolveInternalTarget(filePath, baseHref, href);
            if (!candidatePaths.length) {
                continue;
            }

            const exists = candidatePaths.some((candidatePath) => fs.existsSync(candidatePath));
            if (!exists) {
                const printable = candidatePaths
                    .map((candidatePath) => toSitePath(candidatePath))
                    .join(" or ");
                fileIssues.push(`Broken internal link: ${href} (expected ${printable})`);
            }
        }

        if (fileIssues.length) {
            issues.push({
                file: toSitePath(filePath),
                problems: fileIssues,
            });
        }
    }

    const urlsToCheck = [...externalUrls.keys()];
    const externalResults = await runWithConcurrency(
        urlsToCheck,
        EXTERNAL_CONCURRENCY,
        async (url) => ({ url, result: await checkExternalUrl(url) }),
    );

    for (const { url, result } of externalResults) {
        if (!result.ok) {
            const locations = externalUrls.get(url) || [];
            issues.push({
                file: locations[0] || "(unknown)",
                problems: [
                    `External URL returned an error (${result.status || result.error}): ${url}`,
                    `Also referenced in: ${locations.join(", ")}`,
                ],
            });
        }
    }

    console.log(`Scanned ${htmlFiles.length} HTML files.`);
    console.log(`Checked ${totalLinks} links (${urlsToCheck.length} unique external URLs).`);

    if (!issues.length) {
        console.log("PASS: No link issues found.");
        return;
    }

    console.error(`FAIL: Found ${issues.length} issue group(s).`);
    for (const issue of issues) {
        console.error(`\n${issue.file}`);
        for (const problem of issue.problems) {
            console.error(`  - ${problem}`);
        }
    }

    process.exit(1);
}

main().catch((error) => {
    console.error(`Unexpected failure: ${error.message}`);
    process.exit(1);
});
