const BASE = 'https://subsplease.org'
const API = `${BASE}/api/`
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function normalizeEpisode (value) {
  if (value == null || value === '') return ''
  const str = String(value).trim()
  const num = Number(str)
  return Number.isFinite(num) ? String(num) : str.replace(/^0+/, '') || '0'
}

function normalizeResolution (value) {
  if (value == null || value === '') return ''
  return String(value).replace(/p$/i, '')
}

function normalizeSearchTerm (title) {
  return String(title || '')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities (str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function base32ToHex (str) {
  let value = 0
  let bits = 0
  let out = ''
  for (const ch of str.toUpperCase().replace(/=+$/g, '')) {
    const n = BASE32.indexOf(ch)
    if (n === -1) return ''
    value = (value << 5) | n
    bits += 5
    while (bits >= 8) {
      out += ((value >>> (bits - 8)) & 0xff).toString(16).padStart(2, '0')
      bits -= 8
    }
  }
  return out.length >= 40 ? out.slice(0, 40).toLowerCase() : ''
}

function parseMagnet (magnet) {
  const query = String(magnet || '').split('?')[1] || ''
  const params = new URLSearchParams(query)
  const btih = params.get('xt')?.match(/^urn:btih:(.+)$/i)?.[1] || ''
  const hash = /^[a-f0-9]{40}$/i.test(btih) ? btih.toLowerCase() : base32ToHex(btih)
  return {
    hash,
    title: params.get('dn') || '',
    size: Number(params.get('xl')) || 0
  }
}

async function fetchSearch (fetchFn, title) {
  const params = new URLSearchParams({
    f: 'search',
    tz: 'UTC',
    s: title
  })
  let res
  try {
    res = await fetchFn(`${API}?${params.toString()}`)
  } catch (err) {
    throw new Error(`Could not reach SubsPlease: ${err?.message || err}`)
  }
  if (!res.ok) throw new Error(`SubsPlease returned HTTP ${res.status}`)
  try {
    const data = await res.json()
    return data && typeof data === 'object' ? Object.values(data) : []
  } catch {
    throw new Error('SubsPlease returned an unexpected response')
  }
}

function matchesEpisode (entry, query) {
  const want = new Set()
  if (query?.episode != null) want.add(normalizeEpisode(query.episode))
  if (query?.absoluteEpisodeNumber != null) want.add(normalizeEpisode(query.absoluteEpisodeNumber))
  if (!want.size) return true
  return want.has(normalizeEpisode(entry.episode))
}

function hasExcludedText (title, exclusions) {
  if (!Array.isArray(exclusions) || !exclusions.length) return false
  const lower = title.toLowerCase()
  return exclusions
    .map(e => String(e).trim().toLowerCase())
    .filter(Boolean)
    .some(e => lower.includes(e))
}

function mapDownload (entry, download) {
  const magnet = download.magnet || ''
  const parsed = parseMagnet(magnet)
  const res = normalizeResolution(download.res)
  const fallbackTitle = `[SubsPlease] ${entry.show || 'Unknown'} - ${entry.episode || '?'}${res ? ` (${res}p)` : ''}.mkv`
  return {
    title: decodeEntities(parsed.title || fallbackTitle),
    link: magnet,
    hash: parsed.hash,
    seeders: 0,
    leechers: 0,
    downloads: 0,
    size: parsed.size,
    date: entry.release_date ? new Date(entry.release_date) : new Date(0),
    accuracy: 'medium'
  }
}

async function search (query) {
  const fetchFn = query?.fetch ?? globalThis.fetch
  const titles = (query?.titles || []).map(normalizeSearchTerm).filter(Boolean)
  if (!titles.length) return []

  const resolution = normalizeResolution(query.resolution)
  const results = []
  const seen = new Set()

  for (const title of titles.slice(0, 4)) {
    const entries = await fetchSearch(fetchFn, title)
    for (const entry of entries) {
      if (!matchesEpisode(entry, query)) continue
      const downloads = Array.isArray(entry.downloads) ? entry.downloads : []
      for (const download of downloads) {
        if (resolution && normalizeResolution(download.res) !== resolution) continue
        const mapped = mapDownload(entry, download)
        if (!mapped.link || !mapped.hash || hasExcludedText(mapped.title, query.exclusions)) continue
        if (seen.has(mapped.hash)) continue
        seen.add(mapped.hash)
        results.push(mapped)
      }
    }
  }

  return results
}

export default {
  async test () {
    const res = await globalThis.fetch(`${API}?f=search&tz=UTC&s=test`)
    if (!res.ok) throw new Error(`SubsPlease is unreachable (HTTP ${res.status})`)
    return true
  },
  single (query) { return search(query) },
  batch () { return [] },
  movie (query) { return search(query) }
}
