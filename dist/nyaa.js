// src/nyaa.js
var BASE = "https://nyaa.si";
var CATEGORY = "1_2";
var FILTER = "0";
var SIZE_UNITS = {
  B: 1,
  KIB: 1024,
  KB: 1024,
  MIB: 1024 ** 2,
  MB: 1024 ** 2,
  GIB: 1024 ** 3,
  GB: 1024 ** 3,
  TIB: 1024 ** 4,
  TB: 1024 ** 4
};
function parseSize(str) {
  if (!str) return 0;
  const m = str.match(/([\d.]+)\s*([KMGT]i?B|B)/i);
  if (!m) return 0;
  const value = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  return Math.round(value * (SIZE_UNITS[unit] ?? 0));
}
function decodeEntities(str) {
  return str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function pickTag(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`);
  const m = block.match(re);
  return m ? decodeEntities(m[1].trim()) : "";
}
function parseRss(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const title = pickTag(block, "title");
    const link = pickTag(block, "link");
    const pubDate = pickTag(block, "pubDate");
    const seeders = parseInt(pickTag(block, "nyaa:seeders") || "0", 10);
    const leechers = parseInt(pickTag(block, "nyaa:leechers") || "0", 10);
    const downloads = parseInt(pickTag(block, "nyaa:downloads") || "0", 10);
    const hash = pickTag(block, "nyaa:infoHash").toLowerCase();
    const size = parseSize(pickTag(block, "nyaa:size"));
    if (!hash || !title) continue;
    items.push({
      title,
      link: link || `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}`,
      hash,
      seeders: Number.isFinite(seeders) ? seeders : 0,
      leechers: Number.isFinite(leechers) ? leechers : 0,
      downloads: Number.isFinite(downloads) ? downloads : 0,
      size,
      date: pubDate ? new Date(pubDate) : /* @__PURE__ */ new Date(0),
      accuracy: "medium"
    });
  }
  return items;
}
function extractEpisodeNumbers(title) {
  const cleaned = title.replace(/\{[^{}]*\}/g, "").replace(/\b\d{3,4}p\b/gi, "").replace(/\b(?:19|20)\d{2}\b/g, "").replace(/\bx26[45]\b/gi, "").replace(/\bh\.?26[45]\b/gi, "").replace(/\b[57]\.1\b/g, "").replace(/\b\d+(?:bit|fps|kbps|ch)\b/gi, "").replace(/\bv\d+\b/gi, "").replace(/\[[A-F0-9]{6,}\]/gi, "").replace(/\([A-F0-9]{6,}\)/gi, "");
  const numbers = /* @__PURE__ */ new Set();
  const re = /(?<![\d.])(\d{1,4})(?![\d.])/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) numbers.add(Number(m[1]));
  return numbers;
}
function matchesEpisode(title, { episode, absoluteEpisodeNumber }) {
  const want = /* @__PURE__ */ new Set();
  if (episode != null) want.add(Number(episode));
  if (absoluteEpisodeNumber != null) want.add(Number(absoluteEpisodeNumber));
  if (!want.size) return true;
  const have = extractEpisodeNumbers(title);
  for (const n of want) if (have.has(n)) return true;
  return false;
}
function sanitizeTitle(title) {
  return title.replace(/[‐-―−]/g, "-").replace(/[^\w\s-]+/g, " ").replace(/\s+/g, " ").trim();
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
function matchesSeason(resultTitle, expectedSeason) {
  const hints = extractSeasonHints(resultTitle);
  if (expectedSeason == null) return !hints.size || hints.has(1);
  if (!hints.size) return expectedSeason === 1;
  return hints.has(expectedSeason);
}
function uniqueCoreTitles(titles, limit) {
  const tried = /* @__PURE__ */ new Set();
  const out = [];
  for (const t of titles || []) {
    const core = getCoreTitle(t);
    const key = sanitizeTitle(core).toLowerCase().replace(/[\s_-]+/g, "");
    if (!key || tried.has(key)) continue;
    tried.add(key);
    out.push(core);
    if (out.length >= limit) break;
  }
  return out;
}
var SINGLE_EPISODE_RE = /\s-\s\d{1,3}(?:v\d)?(?=\s|$|\.|\[)|\bS\d{1,2}E\d{1,3}\b|\bEpisode\s+\d{1,3}\b/i;
var EPISODE_RANGE_RE = /\b\d{1,3}\s*[-~]\s*\d{1,3}\b/;
function looksLikeBatch(title) {
  if (SINGLE_EPISODE_RE.test(title)) return false;
  if (EPISODE_RANGE_RE.test(title)) return true;
  return /\b(?:batch|complete|season|s\d{1,2}(?!\s*e\d)|bd[\s-]?box|cour|collection)\b/i.test(title);
}
function buildQueryForCore(core, { episode, resolution, exclusions }, kind) {
  const parts = [];
  const t = sanitizeTitle(core);
  if (t) parts.push(t);
  if (kind === "single" && episode != null) {
    parts.push(String(episode).padStart(2, "0"));
  } else if (kind === "batch") {
    parts.push("batch");
  }
  if (resolution) parts.push(resolution + "p");
  if (Array.isArray(exclusions)) {
    for (const ex of exclusions.slice(0, 8)) {
      const token = sanitizeTitle(ex).split(" ")[0];
      if (token) parts.push("-" + token);
    }
  }
  return parts.join(" ").trim();
}
async function fetchRss(fetchFn, query, sort) {
  const params = new URLSearchParams({
    page: "rss",
    q: query,
    c: CATEGORY,
    f: FILTER,
    s: sort,
    o: "desc"
  });
  const url = `${BASE}/?${params.toString()}`;
  let res;
  try {
    res = await fetchFn(url);
  } catch (err) {
    throw new Error(`Could not reach nyaa.si: ${err?.message || err}`);
  }
  if (!res.ok) throw new Error(`nyaa.si returned HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.indexOf("<rss") === -1) {
    throw new Error("nyaa.si returned an unexpected response (no RSS payload)");
  }
  return parseRss(text);
}
function resolveSort(options) {
  return options?.sortByDate ? "id" : "seeders";
}
async function search(query, options, kind) {
  const fetchFn = query?.fetch ?? globalThis.fetch;
  const titles = query?.titles || [];
  if (!titles.length) return [];
  const expectedSeason = inferQuerySeason(titles);
  const sort = resolveSort(options);
  const cores = uniqueCoreTitles(titles, 4);
  if (!cores.length) return [];
  const seen = /* @__PURE__ */ new Set();
  const merged = [];
  for (const core of cores) {
    const q = buildQueryForCore(core, query, kind);
    if (!q) continue;
    let results;
    try {
      results = await fetchRss(fetchFn, q, sort);
    } catch {
      continue;
    }
    for (const r of results) {
      if (!r.hash || seen.has(r.hash)) continue;
      seen.add(r.hash);
      merged.push(r);
    }
  }
  let filtered = merged;
  if (kind === "single" && (query.episode != null || query.absoluteEpisodeNumber != null)) {
    filtered = filtered.filter((r) => matchesEpisode(r.title, query));
  }
  if (kind === "single" || kind === "batch") {
    filtered = filtered.filter((r) => matchesSeason(r.title, expectedSeason));
  }
  if (kind === "batch") {
    filtered = filtered.filter((r) => looksLikeBatch(r.title)).map((r) => ({ ...r, type: "batch" }));
  }
  return filtered;
}
var nyaa_default = {
  async test() {
    const fetchFn = globalThis.fetch;
    const params = new URLSearchParams({ page: "rss", q: "test", c: CATEGORY, f: FILTER });
    const res = await fetchFn(`${BASE}/?${params.toString()}`);
    if (!res.ok) throw new Error(`nyaa.si is unreachable (HTTP ${res.status})`);
    const text = await res.text();
    if (text.indexOf("<rss") === -1) throw new Error("nyaa.si returned an unexpected response");
    return true;
  },
  single(query, options) {
    return search(query, options, "single");
  },
  batch(query, options) {
    return search(query, options, "batch");
  },
  movie(query, options) {
    return search(query, options, "movie");
  }
};
export {
  nyaa_default as default
};
