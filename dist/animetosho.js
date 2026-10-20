// src/lib/release-language.js
var ENGLISH_CODE_RE = /^en(?:g|m|[-_][a-z0-9]+)?$/i;
var SUBTITLE_HINT_RE = /\b(?:eng(?:lish)?[\s._-]*sub(?:title)?s?|sub(?:title)?s?[\s._-]*eng(?:lish)?|multi(?:ple)?[\s._-]*sub(?:title)?s?|multisubs?|m[\s._-]*subs?)\b/i;
var RAW_HINT_RE = /\b(?:raws?|unsubbed|no[\s._-]*subs?)\b/i;
function includesEnglish(languages) {
  return String(languages).split(",").some((language) => ENGLISH_CODE_RE.test(language.trim()));
}
function hasEnglishSubtitles(title) {
  const text = String(title || "");
  const tagBlocks = [...text.matchAll(/\{Tags:([^}]*)\}/gi)];
  for (const [, tags] of tagBlocks) {
    const subtitleFields = [...tags.matchAll(/(?:^|;)\s*[FS]\s*=\s*([^;]*)/gi)];
    if (subtitleFields.length) {
      return subtitleFields.some(([, languages]) => includesEnglish(languages));
    }
    if (/(?:^|;)\s*A\s*=/i.test(tags)) {
      return SUBTITLE_HINT_RE.test(text);
    }
  }
  if (SUBTITLE_HINT_RE.test(text)) return true;
  return !RAW_HINT_RE.test(text);
}

// src/animetosho.js
var BASE = "https://animetosho.org/feed/json";
var QUALITIES = ["1080", "720", "540", "480"];
var FAKE_PEER_THRESHOLD = 3e4;
function buildQ(resolution, exclusions) {
  const groups = [];
  const ex = (exclusions || []).map((e) => String(e).trim()).filter(Boolean);
  if (ex.length) groups.push("!(" + ex.map((e) => `"${e}"`).join("|") + ")");
  if (resolution) {
    const other = QUALITIES.filter((q) => q !== String(resolution));
    if (other.length) groups.push("!(" + other.map((q) => `*${q}*`).join("|") + ")");
  }
  return groups.join("");
}
function buildUrl(params, resolution, exclusions) {
  const sp = new URLSearchParams(params);
  const q = buildQ(resolution, exclusions);
  if (q) {
    sp.set("qx", "1");
    sp.set("q", q);
  }
  return `${BASE}?${sp.toString()}`;
}
function cleanPeers(n) {
  const num = Number(n) || 0;
  return num >= FAKE_PEER_THRESHOLD ? 0 : num;
}
function mapEntry(entry, { batch = false } = {}) {
  return {
    title: entry.title || entry.torrent_name || "",
    link: entry.magnet_uri || `magnet:?xt=urn:btih:${entry.info_hash}`,
    hash: String(entry.info_hash || "").toLowerCase(),
    seeders: cleanPeers(entry.seeders),
    leechers: cleanPeers(entry.leechers),
    downloads: Number(entry.torrent_downloaded_count) || 0,
    size: Number(entry.total_size) || 0,
    date: entry.timestamp ? new Date(entry.timestamp * 1e3) : /* @__PURE__ */ new Date(0),
    accuracy: entry.anidb_fid ? "high" : "medium",
    ...batch ? { type: "batch" } : {}
  };
}
async function fetchJson(fetchFn, url) {
  let res;
  try {
    res = await fetchFn(url);
  } catch (err) {
    throw new Error(`Could not reach AnimeTosho: ${err?.message || err}`);
  }
  if (!res.ok) throw new Error(`AnimeTosho returned HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error("AnimeTosho returned an unexpected response");
  }
}
var animetosho_default = {
  async test() {
    const res = await globalThis.fetch(BASE);
    if (!res.ok) throw new Error(`AnimeTosho is unreachable (HTTP ${res.status})`);
    return true;
  },
  async single(query) {
    const fetchFn = query?.fetch ?? globalThis.fetch;
    const { anidbEid, resolution, exclusions } = query || {};
    if (!anidbEid) throw new Error("AnimeTosho needs an AniDB episode ID, which is missing for this episode.");
    const url = buildUrl({ eid: String(anidbEid) }, resolution, exclusions);
    const data = await fetchJson(fetchFn, url);
    return Array.isArray(data) ? data.filter((e) => hasEnglishSubtitles(e.title || e.torrent_name)).map((e) => mapEntry(e)) : [];
  },
  async batch(query) {
    const fetchFn = query?.fetch ?? globalThis.fetch;
    const { anidbAid, resolution, exclusions, episodeCount } = query || {};
    if (!anidbAid) throw new Error("AnimeTosho needs an AniDB anime ID, which is missing for this show.");
    const url = buildUrl({ aid: String(anidbAid), order: "size-d" }, resolution, exclusions);
    const data = await fetchJson(fetchFn, url);
    if (!Array.isArray(data)) return [];
    const translated = data.filter((e) => hasEnglishSubtitles(e.title || e.torrent_name));
    const filtered = episodeCount ? translated.filter((e) => (e.num_files ?? 0) >= episodeCount) : translated;
    return filtered.map((e) => mapEntry(e, { batch: true }));
  },
  async movie(query) {
    const fetchFn = query?.fetch ?? globalThis.fetch;
    const { anidbAid, resolution, exclusions } = query || {};
    if (!anidbAid) throw new Error("AnimeTosho needs an AniDB anime ID, which is missing for this title.");
    const url = buildUrl({ aid: String(anidbAid) }, resolution, exclusions);
    const data = await fetchJson(fetchFn, url);
    return Array.isArray(data) ? data.filter((e) => hasEnglishSubtitles(e.title || e.torrent_name)).map((e) => mapEntry(e)) : [];
  }
};
export {
  animetosho_default as default
};
