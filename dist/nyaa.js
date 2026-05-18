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
function sanitizeTitle(title) {
  return title.replace(/[‐-―−]/g, "-").replace(/[^\w\s-]+/g, " ").replace(/\s+/g, " ").trim();
}
function buildQuery({ titles, episode, resolution, exclusions }, { kind }) {
  const parts = [];
  const title = sanitizeTitle(titles?.[0] ?? "");
  if (title) parts.push(title);
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
  if (!query?.titles?.length) return [];
  const q = buildQuery(query, { kind });
  if (!q) return [];
  const sort = resolveSort(options);
  return fetchRss(fetchFn, q, sort);
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
