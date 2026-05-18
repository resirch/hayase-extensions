const BASE = 'https://releases.moe/api/collections/entries/records'
const REDACTED = '<redacted>'

function buildTitle (torrent, fallbackTitle) {
  if (torrent.files?.length === 1) return torrent.files[0].name
  const group = torrent.releaseGroup ? `[${torrent.releaseGroup}] ` : ''
  const dual = torrent.dualAudio ? ' (Dual Audio)' : ''
  return `${group}${fallbackTitle}${dual}`.trim()
}

function totalSize (files) {
  if (!Array.isArray(files)) return 0
  let total = 0
  for (const f of files) total += Number(f.length) || 0
  return total
}

function mapTorrent (torrent, fallbackTitle) {
  return {
    title: buildTitle(torrent, fallbackTitle),
    link: torrent.infoHash,
    hash: torrent.infoHash,
    seeders: 0,
    leechers: 0,
    downloads: 0,
    size: totalSize(torrent.files),
    date: torrent.created ? new Date(torrent.created) : new Date(0),
    accuracy: 'high',
    type: torrent.isBest ? 'best' : 'alt'
  }
}

async function fetchEntry (fetchFn, anilistId) {
  const params = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `alID="${anilistId}"`,
    skipTotal: '1',
    expand: 'trs'
  })
  let res
  try {
    res = await fetchFn(`${BASE}?${params.toString()}`)
  } catch (err) {
    throw new Error(`Could not reach releases.moe: ${err?.message || err}`)
  }
  if (!res.ok) throw new Error(`releases.moe returned HTTP ${res.status}`)
  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('releases.moe returned an unexpected response')
  }
  return data.items?.[0]?.expand?.trs ?? []
}

async function search (query, kind) {
  const fetchFn = query?.fetch ?? globalThis.fetch
  const { anilistId, titles, episodeCount } = query || {}
  if (!anilistId) throw new Error('SeaDex needs an AniList ID, which is missing for this title.')

  const torrents = await fetchEntry(fetchFn, anilistId)
  if (!torrents.length) return []

  const fallbackTitle = titles?.[0] ?? `AniList ${anilistId}`

  return torrents
    .filter(t => t.infoHash && t.infoHash !== REDACTED)
    .filter(t => {
      if (kind !== 'batch') return true
      if (!episodeCount || episodeCount === 1) return true
      return (t.files?.length ?? 0) >= episodeCount
    })
    .map(t => mapTorrent(t, fallbackTitle))
}

export default {
  async test () {
    const fetchFn = globalThis.fetch
    const res = await fetchFn(`${BASE}?page=1&perPage=1&skipTotal=1`)
    if (!res.ok) throw new Error(`releases.moe is unreachable (HTTP ${res.status})`)
    return true
  },
  single (query) { return search(query, 'single') },
  batch (query) { return search(query, 'batch') },
  movie (query) { return search(query, 'movie') }
}
