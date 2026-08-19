const ENGLISH_CODE_RE = /^en(?:g|m|[-_][a-z0-9]+)?$/i
const SUBTITLE_HINT_RE = /\b(?:eng(?:lish)?[\s._-]*sub(?:title)?s?|sub(?:title)?s?[\s._-]*eng(?:lish)?|multi(?:ple)?[\s._-]*sub(?:title)?s?|multisubs?|m[\s._-]*subs?)\b/i
const RAW_HINT_RE = /\b(?:raws?|unsubbed|no[\s._-]*subs?)\b/i

function includesEnglish (languages) {
  return String(languages)
    .split(',')
    .some(language => ENGLISH_CODE_RE.test(language.trim()))
}

// nekoBT appends media metadata such as `{Tags:A=ja;F=en;S=en;}`.
// F and S describe subtitle languages. When that metadata is absent, only
// reject a release if its title explicitly identifies it as raw/unsubbed.
export function hasEnglishSubtitles (title) {
  const text = String(title || '')
  const tagBlocks = [...text.matchAll(/\{Tags:([^}]*)\}/gi)]

  for (const [, tags] of tagBlocks) {
    const subtitleFields = [...tags.matchAll(/(?:^|;)\s*[FS]\s*=\s*([^;]*)/gi)]
    if (subtitleFields.length) {
      return subtitleFields.some(([, languages]) => includesEnglish(languages))
    }

    // Audio metadata with no subtitle metadata means the indexed release has
    // no known subtitle tracks. Preserve an explicit subtitle claim in case
    // the indexer's media scan was incomplete.
    if (/(?:^|;)\s*A\s*=/i.test(tags)) {
      return SUBTITLE_HINT_RE.test(text)
    }
  }

  if (SUBTITLE_HINT_RE.test(text)) return true
  return !RAW_HINT_RE.test(text)
}
