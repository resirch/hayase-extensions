export const SEASON_CHOP_RE = /(\s+\d{1,2}(?:st|nd|rd|th)\s+season\b|\s+S\d{1,2}(?:E\d{1,3})?\b|\s+season\s+\d{1,2}\b|\s+part\s+\d{1,2}\b|\s+cour\s+\d{1,2}\b|\s+\d{1,2}\s*$)/i

export function getCoreTitle (rawTitle) {
  let t = String(rawTitle || '')
  const colonIdx = t.indexOf(':')
  if (colonIdx > 4) {
    const prefix = t.slice(0, colonIdx).trim()
    // Multi-word franchise before ":" (e.g. "Sword Art Online: Ordinal Scale");
    // single-word brands (e.g. "Cyberpunk: Edgerunners") keep the full title.
    if (prefix.split(/\s+/).filter(Boolean).length >= 2) t = t.slice(0, colonIdx)
  }
  const m = t.match(SEASON_CHOP_RE)
  if (m) t = t.slice(0, m.index)
  t = t.replace(/\s+\d{1,2}(?:st|nd|rd|th)\b/gi, '')
  return t.replace(/\s+/g, ' ').trim()
}

export function extractSeasonHints (text) {
  const seasons = new Set()
  const parts = new Set()
  const s = String(text)
  for (const m of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/ig)) seasons.add(Number(m[1]))
  for (const m of s.matchAll(/\bS(\d{1,2})(?:E\d{1,3})?(?![\w-])/ig)) seasons.add(Number(m[1]))
  for (const m of s.matchAll(/\bseason\s+(\d{1,2})(?![\d\w-])/ig)) seasons.add(Number(m[1]))
  for (const m of s.matchAll(/\bcour\s*(\d{1,2})\b/ig)) parts.add(Number(m[1]))
  for (const m of s.matchAll(/\bpart\s*(\d{1,2})\b/ig)) parts.add(Number(m[1]))
  for (const m of s.matchAll(/\bpt\.?\s*(\d{1,2})\b/ig)) parts.add(Number(m[1]))
  return { seasons, parts }
}

export function inferQuerySeason (titles) {
  const strong = /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i
  for (const t of titles || []) {
    const m = String(t).match(strong)
    if (m) {
      const { parts } = extractSeasonHints(t)
      return { season: Number(m[1]), part: parts.size ? [...parts][0] : null }
    }
  }
  for (const t of titles || []) {
    const { seasons, parts } = extractSeasonHints(t)
    if (seasons.size) {
      return { season: [...seasons][0], part: parts.size ? [...parts][0] : null }
    }
  }
  for (const t of titles || []) {
    const s = String(t)
    const m = s.match(/\s(\d{1,2})\s*$/)
    if (
      m &&
      Number(m[1]) >= 2 &&
      !/\b(?:part|cour|pt\.?)\s*\d{1,2}\s*$/i.test(s)
    ) {
      return { season: Number(m[1]), part: null }
    }
  }
  for (const t of titles || []) {
    const { seasons, parts } = extractSeasonHints(t)
    // Only trust a part-only hint when backed by an explicit "Cour N" marker
    // or a season number. A bare "Part N" in a synonym must not force a part
    // filter onto results that name the cour differently on Nyaa.
    if (parts.size && (seasons.size || /\bcour\s*\d\b/i.test(t))) {
      return { season: null, part: [...parts][0] }
    }
  }
  return null
}

export function matchesSeason (resultTitle, expected) {
  const { seasons, parts } = extractSeasonHints(resultTitle)
  if (expected == null) {
    return (!seasons.size || seasons.has(1)) && (!parts.size || parts.has(1))
  }
  if (expected.season != null) {
    if (!seasons.size) {
      if (expected.season !== 1) return false
    } else if (!seasons.has(expected.season)) {
      return false
    }
  }
  if (expected.part != null) {
    if (!parts.size) {
      if (expected.part !== 1) return false
    } else if (!parts.has(expected.part)) {
      return false
    }
  }
  return true
}
