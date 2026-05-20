// src/nekobt.js
var BASE = "https://nekobt.to/api/torznab/api";
function decodeEntities(str) {
  return str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function pickTag(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`);
  const m = block.match(re);
  return m ? m[1].trim() : "";
}
function parseTorznab(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const title = decodeEntities(pickTag(block, "title"));
    const link = decodeEntities(pickTag(block, "link"));
    const pubDate = pickTag(block, "pubDate");
    const size = Number(pickTag(block, "size")) || 0;
    const attrs = {};
    const attrRe = /<torznab:attr\s+name="([^"]+)"\s+value="([^"]*)"\s*\/?>/g;
    let am;
    while ((am = attrRe.exec(block)) !== null) {
      attrs[am[1]] = decodeEntities(am[2]);
    }
    const hash = String(attrs.infohash || "").toLowerCase();
    if (!hash || !title) continue;
    items.push({
      title,
      link: attrs.magneturl || link || `magnet:?xt=urn:btih:${hash}`,
      hash,
      seeders: Number(attrs.seeders) || 0,
      leechers: Number(attrs.leechers) || 0,
      downloads: Number(attrs.grabs) || 0,
      size: Number(attrs.size) || size,
      date: pubDate ? new Date(pubDate) : /* @__PURE__ */ new Date(0),
      accuracy: "medium"
    });
  }
  return items;
}
function sanitizeTitle(title) {
  return String(title || "").replace(/[‐-―−]/g, "-").replace(/[^\w\s-]+/g, " ").replace(/\s+/g, " ").trim();
}
function extractEpisodeNumbers(title) {
  const cleaned = title.replace(/\b\d{3,4}p\b/gi, "").replace(/\b(?:19|20)\d{2}\b/g, "").replace(/\bx26[45]\b/gi, "").replace(/\bh\.?26[45]\b/gi, "").replace(/\b[57]\.1\b/g, "").replace(/\b\d+(?:bit|fps|kbps|ch)\b/gi, "").replace(/\bv\d+\b/gi, "").replace(/\[[A-F0-9]{6,}\]/gi, "").replace(/\([A-F0-9]{6,}\)/gi, "");
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
function hasExcludedText(title, exclusions) {
  if (!Array.isArray(exclusions) || !exclusions.length) return false;
  const lower = title.toLowerCase();
  return exclusions.map((e) => String(e).trim().toLowerCase()).filter(Boolean).some((e) => lower.includes(e));
}
function buildQuery({ titles, episode, resolution }, kind) {
  const parts = [];
  const title = sanitizeTitle(titles?.[0] ?? "");
  if (title) parts.push(title);
  if (kind === "single" && episode != null) {
    parts.push(String(episode).padStart(2, "0"));
  }
  if (resolution) parts.push(resolution + "p");
  return parts.join(" ").trim();
}
function looksLikeBatch(title) {
  return /\b(?:batch|complete|season|s\d{1,2}(?!\s*e\d)|bd[\s-]?box|cour|collection)\b/i.test(title);
}
async function fetchSearch(fetchFn, params) {
  const url = `${BASE}?${params.toString()}`;
  let res;
  try {
    res = await fetchFn(url);
  } catch (err) {
    throw new Error(`Could not reach nekoBT: ${err?.message || err}`);
  }
  if (!res.ok) throw new Error(`nekoBT returned HTTP ${res.status}`);
  const text = await res.text();
  if (text.indexOf("<rss") === -1) {
    throw new Error("nekoBT returned an unexpected response (no RSS payload)");
  }
  return parseTorznab(text);
}
async function search(query, kind) {
  const fetchFn = query?.fetch ?? globalThis.fetch;
  if (!query?.titles?.length) return [];
  const q = buildQuery(query, kind);
  if (!q) return [];
  const params = new URLSearchParams({
    t: kind === "movie" ? "movie-search" : "search",
    q,
    limit: "50"
  });
  let results = await fetchSearch(fetchFn, params);
  if (kind === "single" && (query.episode != null || query.absoluteEpisodeNumber != null)) {
    results = results.filter((r) => matchesEpisode(r.title, query));
  }
  if (kind === "batch") {
    results = results.filter((r) => looksLikeBatch(r.title)).map((r) => ({ ...r, type: "batch" }));
  }
  if (Array.isArray(query.exclusions) && query.exclusions.length) {
    results = results.filter((r) => !hasExcludedText(r.title, query.exclusions));
  }
  return results;
}
var nekobt_default = {
  async test() {
    const res = await globalThis.fetch(`${BASE}?t=caps`);
    if (!res.ok) throw new Error(`nekoBT is unreachable (HTTP ${res.status})`);
    const text = await res.text();
    if (!text.includes("<caps")) throw new Error("nekoBT did not return a Torznab caps response");
    return true;
  },
  single(query) {
    return search(query, "single");
  },
  batch(query) {
    return search(query, "batch");
  },
  movie(query) {
    return search(query, "movie");
  }
};
export {
  nekobt_default as default
};
