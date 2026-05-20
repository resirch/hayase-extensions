// src/subsplease.js
var BASE = "https://subsplease.org";
var API = `${BASE}/api/`;
var BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function normalizeEpisode(value) {
  if (value == null || value === "") return "";
  const str = String(value).trim();
  const num = Number(str);
  return Number.isFinite(num) ? String(num) : str.replace(/^0+/, "") || "0";
}
function normalizeResolution(value) {
  if (value == null || value === "") return "";
  return String(value).replace(/p$/i, "");
}
function normalizeSearchTerm(title) {
  return String(title || "").replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim();
}
var SEASON_CHOP_RE = /(\s+\d{1,2}(?:st|nd|rd|th)\s+season\b|\s+S\d{1,2}(?:E\d{1,3})?\b|\s+season\s+\d{1,2}\b|\s+part\s+\d{1,2}\b)/i;
function getCoreTitle(rawTitle) {
  let t = String(rawTitle || "");
  const colonIdx = t.indexOf(":");
  if (colonIdx > 4) t = t.slice(0, colonIdx);
  const m = t.match(SEASON_CHOP_RE);
  if (m) t = t.slice(0, m.index);
  t = t.replace(/\s+\d{1,2}(?:st|nd|rd|th)\b/gi, "");
  return t.replace(/\s+/g, " ").trim();
}
function extractSeasonHints(text) {
  const hints = /* @__PURE__ */ new Set();
  const s = String(text);
  for (const m of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/ig)) hints.add(Number(m[1]));
  for (const m of s.matchAll(/\bS(\d{1,2})(?:E\d{1,3})?(?![\w-])/ig)) hints.add(Number(m[1]));
  for (const m of s.matchAll(/\bseason\s+(\d{1,2})(?![\d\w-])/ig)) hints.add(Number(m[1]));
  return hints;
}
function inferQuerySeason(titles) {
  const strong = /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i;
  for (const t of titles || []) {
    const m = String(t).match(strong);
    if (m) return Number(m[1]);
  }
  for (const t of titles || []) {
    const hints = extractSeasonHints(t);
    if (hints.size) return [...hints][0];
  }
  return null;
}
function matchesSeason(text, expectedSeason) {
  const hints = extractSeasonHints(text);
  if (expectedSeason == null) return !hints.size || hints.has(1);
  if (!hints.size) return expectedSeason === 1;
  return hints.has(expectedSeason);
}
function decodeEntities(str) {
  return str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function base32ToHex(str) {
  let value = 0;
  let bits = 0;
  let out = "";
  for (const ch of str.toUpperCase().replace(/=+$/g, "")) {
    const n = BASE32.indexOf(ch);
    if (n === -1) return "";
    value = value << 5 | n;
    bits += 5;
    while (bits >= 8) {
      out += (value >>> bits - 8 & 255).toString(16).padStart(2, "0");
      bits -= 8;
    }
  }
  return out.length >= 40 ? out.slice(0, 40).toLowerCase() : "";
}
function parseMagnet(magnet) {
  const query = String(magnet || "").split("?")[1] || "";
  const params = new URLSearchParams(query);
  const btih = params.get("xt")?.match(/^urn:btih:(.+)$/i)?.[1] || "";
  const hash = /^[a-f0-9]{40}$/i.test(btih) ? btih.toLowerCase() : base32ToHex(btih);
  return {
    hash,
    title: params.get("dn") || "",
    size: Number(params.get("xl")) || 0
  };
}
async function fetchSearch(fetchFn, title) {
  const params = new URLSearchParams({
    f: "search",
    tz: "UTC",
    s: title
  });
  let res;
  try {
    res = await fetchFn(`${API}?${params.toString()}`);
  } catch (err) {
    throw new Error(`Could not reach SubsPlease: ${err?.message || err}`);
  }
  if (!res.ok) throw new Error(`SubsPlease returned HTTP ${res.status}`);
  try {
    const data = await res.json();
    return data && typeof data === "object" ? Object.values(data) : [];
  } catch {
    throw new Error("SubsPlease returned an unexpected response");
  }
}
function matchesEpisode(entry, query) {
  const want = /* @__PURE__ */ new Set();
  if (query?.episode != null) want.add(normalizeEpisode(query.episode));
  if (query?.absoluteEpisodeNumber != null) want.add(normalizeEpisode(query.absoluteEpisodeNumber));
  if (!want.size) return true;
  return want.has(normalizeEpisode(entry.episode));
}
function hasExcludedText(title, exclusions) {
  if (!Array.isArray(exclusions) || !exclusions.length) return false;
  const lower = title.toLowerCase();
  return exclusions.map((e) => String(e).trim().toLowerCase()).filter(Boolean).some((e) => lower.includes(e));
}
function mapDownload(entry, download) {
  const magnet = download.magnet || "";
  const parsed = parseMagnet(magnet);
  const res = normalizeResolution(download.res);
  const fallbackTitle = `[SubsPlease] ${entry.show || "Unknown"} - ${entry.episode || "?"}${res ? ` (${res}p)` : ""}.mkv`;
  return {
    title: decodeEntities(parsed.title || fallbackTitle),
    link: magnet,
    hash: parsed.hash,
    seeders: 0,
    leechers: 0,
    downloads: 0,
    size: parsed.size,
    date: entry.release_date ? new Date(entry.release_date) : /* @__PURE__ */ new Date(0),
    accuracy: "medium"
  };
}
async function search(query) {
  const fetchFn = query?.fetch ?? globalThis.fetch;
  const rawTitles = query?.titles || [];
  if (!rawTitles.length) return [];
  const expectedSeason = inferQuerySeason(rawTitles);
  const resolution = normalizeResolution(query.resolution);
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  const tried = /* @__PURE__ */ new Set();
  const searchTerms = [];
  for (const t of rawTitles) {
    const core = getCoreTitle(t);
    const term = normalizeSearchTerm(core);
    const key = term.toLowerCase().replace(/[\s_-]+/g, "");
    if (!term || tried.has(key)) continue;
    tried.add(key);
    searchTerms.push(term);
    if (searchTerms.length >= 5) break;
  }
  for (const term of searchTerms) {
    const entries = await fetchSearch(fetchFn, term);
    for (const entry of entries) {
      if (!matchesEpisode(entry, query)) continue;
      if (!matchesSeason(entry.show || "", expectedSeason)) continue;
      const downloads = Array.isArray(entry.downloads) ? entry.downloads : [];
      for (const download of downloads) {
        if (resolution && normalizeResolution(download.res) !== resolution) continue;
        const mapped = mapDownload(entry, download);
        if (!mapped.link || !mapped.hash || hasExcludedText(mapped.title, query.exclusions)) continue;
        if (seen.has(mapped.hash)) continue;
        seen.add(mapped.hash);
        results.push(mapped);
      }
    }
  }
  return results;
}
var subsplease_default = {
  async test() {
    const res = await globalThis.fetch(`${API}?f=search&tz=UTC&s=test`);
    if (!res.ok) throw new Error(`SubsPlease is unreachable (HTTP ${res.status})`);
    return true;
  },
  single(query) {
    return search(query);
  },
  batch() {
    return [];
  },
  movie(query) {
    return search(query);
  }
};
export {
  subsplease_default as default
};
