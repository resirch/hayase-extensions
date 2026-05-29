const BASE = 'https://nekobt.to/api/torznab/api'

function decodeEntities (str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function pickTag (block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`)
  const m = block.match(re)
  return m ? m[1].trim() : ''
}

function parseTorznab (xml) {
  const items = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1]
    const title = decodeEntities(pickTag(block, 'title'))
    const link = decodeEntities(pickTag(block, 'link'))
    const pubDate = pickTag(block, 'pubDate')
    const size = Number(pickTag(block, 'size')) || 0

    const attrs = {}
    const attrRe = /<torznab:attr\s+name="([^"]+)"\s+value="([^"]*)"\s*\/?>/g
    let am
    while ((am = attrRe.exec(block)) !== null) {
      attrs[am[1]] = decodeEntities(am[2])
    }

    const hash = String(attrs.infohash || '').toLowerCase()
    if (!hash || !title) continue

    items.push({
      title,
      link: attrs.magneturl || link || `magnet:?xt=urn:btih:${hash}`,
      hash,
      seeders: Number(attrs.seeders) || 0,
      leechers: Number(attrs.leechers) || 0,
      downloads: Number(attrs.grabs) || 0,
      size: Number(attrs.size) || size,
      date: pubDate ? new Date(pubDate) : new Date(0),
      accuracy: 'medium'
    })
  }
  return items
}

function sanitizeTitle (title) {
  return String(title || '')
    .replace(/[‐-―−]/g, '-')
    .replace(/[^\w\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractEpisodeNumbers (title) {
  const cleaned = title
    .replace(/\{[^{}]*\}/g, '')
    .replace(/\b\d{3,4}p\b/gi, '')
    .replace(/\b(?:19|20)\d{2}\b/g, '')
    .replace(/\bx26[45]\b/gi, '')
    .replace(/\bh\.?26[45]\b/gi, '')
    .replace(/\b[57]\.1\b/g, '')
    .replace(/\b\d+(?:bit|fps|kbps|ch)\b/gi, '')
    .replace(/\bv\d+\b/gi, '')
    .replace(/\[[A-F0-9]{6,}\]/gi, '')
    .replace(/\([A-F0-9]{6,}\)/gi, '')
  const numbers = new Set()
  const re = /(?<![\d.])(\d{1,4})(?![\d.])/g
  let m
  while ((m = re.exec(cleaned)) !== null) numbers.add(Number(m[1]))
  return numbers
}

function matchesEpisode (title, { episode, absoluteEpisodeNumber }) {
  const want = new Set()
  if (episode != null) want.add(Number(episode))
  if (absoluteEpisodeNumber != null) want.add(Number(absoluteEpisodeNumber))
  if (!want.size) return true
  const have = extractEpisodeNumbers(title)
  for (const n of want) if (have.has(n)) return true
  return false
}

function hasExcludedText (title, exclusions) {
  if (!Array.isArray(exclusions) || !exclusions.length) return false
  const lower = title.toLowerCase()
  return exclusions
    .map(e => String(e).trim().toLowerCase())
    .filter(Boolean)
    .some(e => lower.includes(e))
}

const SEASON_CHOP_RE = /(\s+\d{1,2}(?:st|nd|rd|th)\s+season\b|\s+S\d{1,2}(?:E\d{1,3})?\b|\s+season\s+\d{1,2}\b|\s+part\s+\d{1,2}\b)/i

function getCoreTitle (rawTitle) {
  let t = String(rawTitle || '')
  const colonIdx = t.indexOf(':')
  if (colonIdx > 4) t = t.slice(0, colonIdx)
  const m = t.match(SEASON_CHOP_RE)
  if (m) t = t.slice(0, m.index)
  t = t.replace(/\s+\d{1,2}(?:st|nd|rd|th)\b/gi, '')
  return t.replace(/\s+/g, ' ').trim()
}

function extractSeasonHints (text) {
  const hints = new Set()
  const s = String(text)
  for (const m of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/ig)) hints.add(Number(m[1]))
  for (const m of s.matchAll(/\bS(\d{1,2})(?:E\d{1,3})?(?![\w-])/ig)) hints.add(Number(m[1]))
  for (const m of s.matchAll(/\bseason\s+(\d{1,2})(?![\d\w-])/ig)) hints.add(Number(m[1]))
  return hints
}

function inferQuerySeason (titles) {
  const strong = /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i
  for (const t of titles || []) {
    const m = String(t).match(strong)
    if (m) return Number(m[1])
  }
  for (const t of titles || []) {
    const hints = extractSeasonHints(t)
    if (hints.size) return [...hints][0]
  }
  return null
}

function matchesSeason (resultTitle, expectedSeason) {
  const hints = extractSeasonHints(resultTitle)
  if (expectedSeason == null) return !hints.size || hints.has(1)
  if (!hints.size) return expectedSeason === 1
  return hints.has(expectedSeason)
}

// A title written mostly in a non-Latin script (CJK, Thai, Cyrillic, ...) leaves
// only an incidental Latin fragment after sanitizing: the native
// "Re:ゼロから始める異世界生活" collapses to "Re", and "โอเวอร์ลอร์ด ภาค 3" to "3".
// Searching for "Re batch 1080p" or "3 09 1080p" then fuzzy-matches unrelated
// torrents (e.g. Rent-A-Girlfriend). Trust the romanized remnant only when its
// Latin letters aren't outnumbered by the non-Latin letters they came from —
// the romaji/English titles already cover the searchable name.
function hasUsableLatinCore (core, sanitized) {
  const ascii = (sanitized.match(/[a-z]/gi) || []).length
  if (!ascii) return false
  const letters = (String(core).match(/\p{L}/gu) || []).length
  return ascii * 2 >= letters
}

function uniqueCoreTitles (titles, limit) {
  const tried = new Set()
  const out = []
  for (const t of titles || []) {
    const core = getCoreTitle(t)
    const sanitized = sanitizeTitle(core)
    if (!hasUsableLatinCore(core, sanitized)) continue
    const key = sanitized.toLowerCase().replace(/[\s_-]+/g, '')
    if (!key || tried.has(key)) continue
    tried.add(key)
    out.push(core)
    if (out.length >= limit) break
  }
  return out
}

function buildQueryForCore (core, { episode, resolution }, kind) {
  const parts = []
  const t = sanitizeTitle(core)
  if (t) parts.push(t)
  if (kind === 'single' && episode != null) {
    parts.push(String(episode).padStart(2, '0'))
  }
  if (resolution) parts.push(resolution + 'p')
  return parts.join(' ').trim()
}

const SINGLE_EPISODE_RE = /\s-\s\d{1,3}(?:v\d)?(?=\s|$|\.|\[)|\bS\d{1,2}E\d{1,3}\b|\bEpisode\s+\d{1,3}\b/i
const EPISODE_RANGE_RE = /\b\d{1,3}\s*[-~]\s*\d{1,3}\b/

function looksLikeBatch (title) {
  if (SINGLE_EPISODE_RE.test(title)) return false
  if (EPISODE_RANGE_RE.test(title)) return true
  return /\b(?:batch|complete|season|s\d{1,2}(?!\s*e\d)|bd[\s-]?box|cour|collection)\b/i.test(title)
}

const MOVIE_HINT_RE = /\b(?:movie|gekijou?ban|gekijou|eiga|film)\b/i
const MOVIE_STOPWORDS = new Set(['the', 'movie', 'film', 'gekijouban', 'gekijoban', 'gekijou', 'ban', 'eiga'])

function titleTokens (s) {
  return sanitizeTitle(String(s)).toLowerCase().split(' ').filter(Boolean)
}

// The movie's distinctive subtitle: tokens of a requested title beyond its
// franchise core. "Sword Art Online: Ordinal Scale" -> {ordinal, scale}; a
// bare-franchise synonym ("Sword Art Online") or a single-part title
// ("A Silent Voice") contributes nothing. Each title's extra tokens form one
// set; a result need only match one set, so romaji and English subtitles
// ("Mugen Ressha-hen" vs "Mugen Train") both work.
function subtitleTokenSets (titles) {
  const sets = []
  const seen = new Set()
  for (const t of titles || []) {
    const core = new Set(titleTokens(getCoreTitle(t)))
    const extra = titleTokens(t).filter(w => w.length > 1 && !core.has(w) && !MOVIE_STOPWORDS.has(w))
    if (!extra.length) continue
    const key = extra.slice().sort().join(' ')
    if (seen.has(key)) continue
    seen.add(key)
    sets.push(new Set(extra))
  }
  return sets
}

// A movie query collapses to a broad core title ("Sword Art Online: Ordinal
// Scale" -> "Sword Art Online"), so the fuzzy search returns the whole
// franchise — TV seasons, single episodes, sibling films. When the title
// carries a distinctive subtitle, require the result to contain it: that alone
// separates the film from same-franchise TV ("Sword Art Online II", "Gun Gale
// Online") and other movies ("Progressive"). Without a subtitle to key on, fall
// back to keeping declared movies and rejecting TV-shaped releases.
function isMovieResult (title, subtitleSets) {
  if (subtitleSets.length) {
    const tokens = new Set(titleTokens(title))
    return subtitleSets.some(set => [...set].every(tok => tokens.has(tok)))
  }
  if (MOVIE_HINT_RE.test(title)) return true
  return !SINGLE_EPISODE_RE.test(title) && !EPISODE_RANGE_RE.test(title)
}

// Hayase classifies a film as a single-episode (episodes === 1) movie, so it
// only ever calls single() for it — movie() never runs. Detect that here from
// the AniList media so single() can apply the movie filter instead of matching
// any franchise torrent that merely contains episode 1 (e.g. a "01 ~ 25" pack).
// Mirrors isMovie() in hayase-app/interface anilist/util.ts.
function isMovieQuery (query) {
  const media = query?.media
  if (!media) return false
  if (media.format === 'MOVIE') return true
  const names = [...Object.values(media.title ?? {}), ...(media.synonyms ?? [])]
  if (names.some(t => typeof t === 'string' && t.toLowerCase().includes('movie'))) return true
  return (media.duration ?? 0) > 80 && media.episodes === 1
}

async function fetchSearch (fetchFn, params) {
  const url = `${BASE}?${params.toString()}`
  let res
  try {
    res = await fetchFn(url)
  } catch (err) {
    throw new Error(`Could not reach nekoBT: ${err?.message || err}`)
  }
  if (!res.ok) throw new Error(`nekoBT returned HTTP ${res.status}`)
  const text = await res.text()
  if (text.indexOf('<rss') === -1) {
    throw new Error('nekoBT returned an unexpected response (no RSS payload)')
  }
  return parseTorznab(text)
}

async function search (query, kind) {
  const fetchFn = query?.fetch ?? globalThis.fetch
  const titles = query?.titles || []
  if (!titles.length) return []

  // Hayase calls single() (not movie()) for episodes===1 films, so treat a
  // movie query as a movie search regardless of the requested episode.
  if (kind === 'single' && isMovieQuery(query)) kind = 'movie'

  const expectedSeason = inferQuerySeason(titles)
  const cores = uniqueCoreTitles(titles, 4)
  if (!cores.length) return []

  const seen = new Set()
  const merged = []
  for (const core of cores) {
    const q = buildQueryForCore(core, query, kind)
    if (!q) continue
    const params = new URLSearchParams({
      t: kind === 'movie' ? 'movie-search' : 'search',
      q,
      limit: '50'
    })
    let results
    try {
      results = await fetchSearch(fetchFn, params)
    } catch {
      continue
    }
    for (const r of results) {
      if (!r.hash || seen.has(r.hash)) continue
      seen.add(r.hash)
      merged.push(r)
    }
  }

  let filtered = merged
  if (kind === 'single' && (query.episode != null || query.absoluteEpisodeNumber != null)) {
    filtered = filtered.filter(r => matchesEpisode(r.title, query))
  }
  if (kind === 'single') {
    filtered = filtered.filter(r => matchesSeason(r.title, expectedSeason))
  }
  if (kind === 'batch') {
    filtered = filtered
      .filter(r => looksLikeBatch(r.title))
      .filter(r => matchesSeason(r.title, expectedSeason))
      .map(r => ({ ...r, type: 'batch' }))
  }
  if (kind === 'movie') {
    const subtitleSets = subtitleTokenSets(titles)
    filtered = filtered
      .filter(r => matchesSeason(r.title, expectedSeason))
      .filter(r => isMovieResult(r.title, subtitleSets))
  }
  if (Array.isArray(query.exclusions) && query.exclusions.length) {
    filtered = filtered.filter(r => !hasExcludedText(r.title, query.exclusions))
  }
  return filtered
}

export default {
  async test () {
    const res = await globalThis.fetch(`${BASE}?t=caps`)
    if (!res.ok) throw new Error(`nekoBT is unreachable (HTTP ${res.status})`)
    const text = await res.text()
    if (!text.includes('<caps')) throw new Error('nekoBT did not return a Torznab caps response')
    return true
  },
  single (query) { return search(query, 'single') },
  batch (query) { return search(query, 'batch') },
  movie (query) { return search(query, 'movie') }
}
