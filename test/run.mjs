import { strict as assert } from 'node:assert'
import nyaa from '../dist/nyaa.js'
import seadex from '../dist/seadex.js'
import animetosho from '../dist/animetosho.js'
import nekobt from '../dist/nekobt.js'
import subsplease from '../dist/subsplease.js'

const log = (...a) => console.log('[test]', ...a)
const section = name => log(`\n── ${name} ──`)

// mirror of extractEpisodeNumbers in src/nyaa.js — used for assertions about results
function extractNumbersFromTitle (title) {
  const cleaned = title
    .replace(/\b\d{3,4}p\b/gi, '')
    .replace(/\b(?:19|20)\d{2}\b/g, '')
    .replace(/\bx26[45]\b/gi, '')
    .replace(/\bh\.?26[45]\b/gi, '')
    .replace(/\b[57]\.1\b/g, '')
    .replace(/\b\d+(?:bit|fps|kbps|ch)\b/gi, '')
    .replace(/\bv\d+\b/gi, '')
    .replace(/\[[A-F0-9]{6,}\]/gi, '')
    .replace(/\([A-F0-9]{6,}\)/gi, '')
  const out = new Set()
  const re = /(?<![\d.])(\d{1,4})(?![\d.])/g
  let m
  while ((m = re.exec(cleaned)) !== null) out.add(Number(m[1]))
  return out
}

function unitFilterChecks () {
  section('Nyaa episode-filter unit checks')
  const cases = [
    // [title, ep, abs, shouldMatch, why]
    ['Tensei Shitara Slime Datta Ken 4th Season - 06 [CR WEB-DL][MultiSub]', 6, 78, true, 'season - 06'],
    ['Tensei Shitara Slime Datta Ken 4th Season - 06 [ WEB ] | Episode 78', 6, 78, true, 'has both 06 and 78'],
    ['Tensei Shitara Slime Datta Ken 4th Season - 04 [ WEB ] | Episode 76', 6, 78, false, 'only 04 and 76 — leaked by Nyaa fuzzy match'],
    ['Tensei Shitara Slime Datta Ken 4th Season - 06 [CR WEBRip][HEVC]', 6, 78, true, 'season - 06 with hevc'],
    ['[Erai-raws] Spy x Family Season 3 - 01 [1080p][9FCD1ABC]', 1, null, true, 'ep 01, CRC stripped'],
    ['[Erai-raws] Spy x Family Season 3 - 02 [1080p]', 1, null, false, 'ep 02 should not match ep 1'],
    ['[Group] One Piece 1000 [1080p]', 1000, null, true, '4-digit episode'],
    ['[Group] Show - 06v2 [1080p]', 6, null, true, 'v2 suffix'],
    ['[Group] Show S04E06 [1080p][10bit][AAC]', 6, null, true, '10bit stripped, S04E06']
  ]
  for (const [title, ep, abs, expected, why] of cases) {
    const nums = extractNumbersFromTitle(title)
    const candidates = new Set()
    if (ep != null) candidates.add(ep)
    if (abs != null) candidates.add(abs)
    const got = [...candidates].some(c => nums.has(c))
    assert.equal(got, expected, `${why} — title="${title}" nums=${[...nums]} want=${[...candidates]}`)
    log(`  ${expected ? '✓' : '✗'} ${why}`)
  }
}

function assertCommon (r, { allowEmptyHash = false } = {}) {
  assert.equal(typeof r.title, 'string', 'title is string')
  assert.equal(typeof r.link, 'string', 'link is string')
  assert.equal(typeof r.hash, 'string', 'hash is string')
  if (!allowEmptyHash) assert.match(r.hash, /^[a-f0-9]{40}$/, 'hash is sha1 hex')
  assert.equal(typeof r.seeders, 'number')
  assert.equal(typeof r.leechers, 'number')
  assert.equal(typeof r.downloads, 'number')
  assert.equal(typeof r.size, 'number')
  assert.ok(r.date instanceof Date && !Number.isNaN(r.date.getTime()), 'date is valid Date')
  assert.ok(['low', 'medium', 'high'].includes(r.accuracy), `accuracy is valid enum (got ${r.accuracy})`)
  if (r.type != null) assert.ok(['batch', 'best', 'alt'].includes(r.type), `type is valid enum (got ${r.type})`)
}

async function testNyaa () {
  section('Nyaa')
  assert.equal(await nyaa.test(), true)
  log('  test() OK')

  const single = await nyaa.single({
    titles: ['Spy x Family'], episode: 1, resolution: '1080', exclusions: [], fetch: globalThis.fetch
  })
  log(`  single() → ${single.length} results`)
  assert.ok(single.length > 0)
  single.slice(0, 2).forEach(r => assertCommon(r))
  for (const r of single) {
    const nums = extractNumbersFromTitle(r.title)
    assert.ok(nums.has(1), `every single() result should contain ep 1, got "${r.title}"`)
  }
  log('  single() episode filter holds for every result')

  log('  Slime S4E6 precision check (regression for "Episode 76" leak)')
  const slime = await nyaa.single({
    titles: ['That Time I Got Reincarnated as a Slime'],
    episode: 6,
    absoluteEpisodeNumber: 78,
    resolution: '1080',
    exclusions: [],
    fetch: globalThis.fetch
  })
  log(`    → ${slime.length} results`)
  for (const r of slime) {
    const nums = extractNumbersFromTitle(r.title)
    const ok = nums.has(6) || nums.has(78)
    assert.ok(ok, `slime result must match ep 6 or abs 78, got "${r.title}" with numbers ${[...nums]}`)
  }
  log('    every slime result matches 6 or 78')

  const filtered = await nyaa.single({
    titles: ['Spy x Family'], episode: 1, resolution: '1080', exclusions: ['x265'], fetch: globalThis.fetch
  })
  log(`  single() w/ -x265 → ${filtered.length} results`)
  assert.ok(filtered.length <= single.length)

  const batch = await nyaa.batch({
    titles: ['Frieren'], resolution: '1080', exclusions: [], fetch: globalThis.fetch
  })
  log(`  batch() → ${batch.length} results`)
  if (batch[0]) assertCommon(batch[0])

  const movie = await nyaa.movie({
    titles: ['A Silent Voice'], resolution: '1080', exclusions: [], fetch: globalThis.fetch
  })
  log(`  movie() → ${movie.length} results`)
  if (movie[0]) assertCommon(movie[0])
}

async function testSeadex () {
  section('SeaDex')
  assert.equal(await seadex.test(), true)
  log('  test() OK')

  // anilistId 21 = One Piece (long-running, always has a seadex entry)
  // anilistId 154587 = Frieren
  const single = await seadex.single({
    anilistId: 154587, titles: ['Frieren'], episodeCount: 28, fetch: globalThis.fetch
  })
  log(`  single(Frieren) → ${single.length} results`)
  assert.ok(single.length > 0, 'Frieren should have seadex entries')
  single.forEach(r => {
    assertCommon(r, { allowEmptyHash: false })
    assert.equal(r.accuracy, 'high')
    assert.ok(['best', 'alt'].includes(r.type), `seadex type is best/alt (got ${r.type})`)
  })
  const best = single.filter(r => r.type === 'best')
  log(`  → ${best.length} marked 'best'`)

  // missing anilistId should throw a user-friendly error
  await assert.rejects(
    () => seadex.single({ titles: ['x'], fetch: globalThis.fetch }),
    /AniList ID/i
  )
  log('  missing anilistId throws user-friendly error ✓')

  // unknown anilistId returns empty
  const empty = await seadex.single({
    anilistId: 999999999, titles: ['Nope'], fetch: globalThis.fetch
  })
  assert.deepEqual(empty, [])
  log('  unknown anilistId → []')
}

async function testAnimeTosho () {
  section('AnimeTosho')
  assert.equal(await animetosho.test(), true)
  log('  test() OK')

  // Frieren anidb anime id = 17617, ep1 fid we'll discover dynamically.
  // Use a stable known anidb aid for testing.
  const aid = 17617 // Frieren: Beyond Journey's End
  const movie = await animetosho.movie({
    anidbAid: aid, resolution: '1080', exclusions: [], fetch: globalThis.fetch
  })
  log(`  movie(aid=${aid}) → ${movie.length} results`)
  assert.ok(movie.length > 0)
  movie.slice(0, 2).forEach(r => assertCommon(r))

  const batch = await animetosho.batch({
    anidbAid: aid, resolution: '1080', exclusions: [], episodeCount: 28, fetch: globalThis.fetch
  })
  log(`  batch(aid=${aid}, ep>=28) → ${batch.length} results`)
  if (batch[0]) {
    assertCommon(batch[0])
    assert.equal(batch[0].type, 'batch')
  }

  // missing IDs should throw a user-friendly error
  await assert.rejects(
    () => animetosho.single({ fetch: globalThis.fetch }),
    /AniDB episode ID/i
  )
  await assert.rejects(
    () => animetosho.batch({ fetch: globalThis.fetch }),
    /AniDB anime ID/i
  )
  log('  missing IDs throw user-friendly errors ✓')
}

async function testSubsPlease () {
  section('SubsPlease')
  assert.equal(await subsplease.test(), true)
  log('  test() OK')

  const single = await subsplease.single({
    titles: ['Sousou no Frieren'], episode: 28, resolution: '1080', exclusions: [], fetch: globalThis.fetch
  })
  log(`  single(Sousou no Frieren 28) → ${single.length} results`)
  assert.ok(single.length > 0)
  single.forEach(r => {
    assertCommon(r)
    assert.match(r.title, /SubsPlease/)
    assert.match(r.title, /1080p/)
  })

  const filtered = await subsplease.single({
    titles: ['Sousou no Frieren'], episode: 28, resolution: '1080', exclusions: ['Frieren'], fetch: globalThis.fetch
  })
  assert.deepEqual(filtered, [])
  log('  exclusions filter release titles ✓')

  assert.deepEqual(await subsplease.batch({ titles: ['Sousou no Frieren'], fetch: globalThis.fetch }), [])
  log('  batch() → []')
}

async function testNekoBT () {
  section('nekoBT')
  assert.equal(await nekobt.test(), true)
  log('  test() OK')

  const single = await nekobt.single({
    titles: ['Frieren'], episode: 1, resolution: '1080', exclusions: [], fetch: globalThis.fetch
  })
  log(`  single(Frieren, ep 1) → ${single.length} results`)
  single.slice(0, 2).forEach(r => assertCommon(r))
  for (const r of single) {
    const nums = extractNumbersFromTitle(r.title)
    assert.ok(nums.has(1), `every nekobt single() result should contain ep 1, got "${r.title}"`)
  }

  const noHevc = await nekobt.single({
    titles: ['Frieren'], episode: 1, resolution: '1080', exclusions: ['HEVC'], fetch: globalThis.fetch
  })
  log(`  single(Frieren, ep 1, -HEVC) → ${noHevc.length} results`)
  for (const r of noHevc) assert.ok(!/hevc/i.test(r.title), `exclusion not applied for "${r.title}"`)

  const movie = await nekobt.movie({
    titles: ['A Silent Voice'], resolution: '1080', exclusions: [], fetch: globalThis.fetch
  })
  log(`  movie(A Silent Voice) → ${movie.length} results`)
  if (movie[0]) assertCommon(movie[0])

  // batch() may legitimately return 0 if no batch of the *requested* season
  // exists yet. We assert shape on whatever it returns, not result count.
  const batch = await nekobt.batch({
    titles: ['Frieren'], resolution: '1080', exclusions: [], fetch: globalThis.fetch
  })
  log(`  batch(Frieren) → ${batch.length} results`)
  batch.slice(0, 3).forEach(r => {
    assertCommon(r)
    assert.equal(r.type, 'batch')
    assert.match(r.title, /\b(?:batch|complete|season|s\d{1,2}|bd|cour|collection)\b/i)
  })

  // Cross-check using an explicit "Sousou no Frieren S2" query — that should
  // surface S2 batches without leaking S1 markers.
  const s2batch = await nekobt.batch({
    titles: ['Sousou no Frieren 2nd Season', 'Sousou no Frieren S2'], resolution: '1080', exclusions: [], fetch: globalThis.fetch
  })
  log(`  batch(Frieren S2) → ${s2batch.length} results`)
  for (const r of s2batch) {
    assertCommon(r)
    assert.equal(r.type, 'batch')
    assert.ok(!/\bS0?1\b(?!\d)|\bS0?1E\d|\b1st\s+season\b/i.test(r.title), `S2 batch leaked S1 marker: "${r.title}"`)
  }

  log('  empty titles → []')
  assert.deepEqual(await nekobt.single({ titles: [], fetch: globalThis.fetch }), [])
}

// Verbatim port of hayase-app/interface src/lib/modules/extensions/extensions.ts createTitles()
function hayaseCreateTitles (media) {
  const grouped = [...new Set(Object.values(media.title ?? {}).concat(media.synonyms).filter(n => n != null && n.length > 3))]
  const titles = []
  const appendTitle = (t) => {
    titles.push(t)
    const m1 = t.match(/(\d)(?:nd|rd|th) Season/i)
    const m2 = t.match(/Season (\d)/i)
    if (m2) titles.push(t.replace(/Season \d/i, 'S' + m2[1]))
    else if (m1) titles.push(t.replace(/(\d)(?:nd|rd|th) Season/i, 'S' + m1[1]))
  }
  for (const t of grouped) {
    appendTitle(t)
    if (t.includes('-')) appendTitle(t.replaceAll('-', ''))
  }
  return titles
}

async function testCoteS4 () {
  section('Classroom of the Elite S4 — Hayase-expanded titles, eps 9/10/11')
  // Reproduces the exact titles Hayase passes for AniList id 180745.
  // Hayase's createTitles expands the AniList titles with Season N -> SN
  // and hyphen-removed variants, so the first several entries are all
  // subtitled romaji ("Youkoso ... 4th Season 2-nensei-hen Ichi Gakki"),
  // not the broad English "Classroom of the Elite".
  const titles = hayaseCreateTitles({
    title: {
      romaji: 'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e 4th Season 2-nensei-hen Ichi Gakki',
      english: 'Classroom of the Elite 4th Season: Second Year, First Semester',
      native: 'ようこそ実力至上主義の教室へ 4th Season 2年生編1学期',
      userPreferred: 'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e 4th Season 2-nensei-hen Ichi Gakki'
    },
    synonyms: [
      'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e: 2-nensei-hen',
      'ようこそ実力至上主義の教室へ ２年生編',
      'Classroom of the Elite: Year 2',
      'Classroom of the Elite Season 4',
      'ようこそ実力至上主義の教室へ 4th Season 2年生1学期'
    ]
  })
  const wrongSeason = /\b(?:[1-3](?:st|nd|rd)\s+season|S0?[1-3](?![\d])|S0?[1-3]E\d|season\s+[1-3](?![\d\w-]))/i

  // Strip nekoBT {Tags:...} suffix the same way the extension does, so the
  // assertion looks at the real release name not the tag block.
  const stripTags = (s) => s.replace(/\{[^{}]*\}/g, '')
  // The episode marker on the actual release (not buried in a tag suffix).
  const explicitEp = (s) => {
    const t = stripTags(s)
    const m1 = t.match(/\bS\d{1,2}E(\d{1,3})\b/i)
    if (m1) return Number(m1[1])
    const m2 = t.match(/\s-\s(\d{1,3})(?=\s|$|\.|\[)/)
    if (m2) return Number(m2[1])
    return null
  }

  for (const ep of [9, 10, 11]) {
    for (const [name, ext] of [['Nyaa', nyaa], ['nekoBT', nekobt], ['SubsPlease', subsplease]]) {
      const r = await ext.single({ titles, episode: ep, resolution: '1080', exclusions: [], fetch: globalThis.fetch })
      log(`  ep${ep} ${name}: ${r.length} results`)
      assert.ok(r.length > 0, `${name} should find S4E${ep}`)
      for (const x of r) {
        assertCommon(x)
        const explicit = explicitEp(x.title)
        if (explicit != null) {
          assert.equal(explicit, ep, `${name}: ep mismatch (wanted ${ep}, title says ${explicit}): "${x.title}"`)
        }
        assert.ok(!wrongSeason.test(x.title), `${name}: leaked wrong-season for ep ${ep}: "${x.title}"`)
      }
    }
  }

  // batch() should not return single-episode releases tagged as batch,
  // and any returned batch must be the requested season (S4) — no S1/S3
  // batches like the user's screenshot leak.
  const otherSeasonMarker = /\bS0?[123]\b(?!\d)|\bS0?[123]E\d|\b[123](?:st|nd|rd)\s+season\b|\bseason\s+[123](?![\d\w-])/i
  for (const [name, ext] of [['Nyaa', nyaa], ['nekoBT', nekobt]]) {
    const b = await ext.batch({ titles, episode: 9, resolution: '1080', exclusions: [], fetch: globalThis.fetch })
    log(`  batch ${name}: ${b.length} results`)
    for (const x of b) {
      assert.equal(explicitEp(x.title), null, `${name}: batch() returned single-episode release "${x.title}"`)
      assert.ok(!otherSeasonMarker.test(x.title), `${name}: batch() returned wrong-season "${x.title}"`)
    }
  }
}

async function testFrierenS1NoS2Leaks () {
  section('Frieren S1 — single-season query must not leak S2+ results')
  // Frieren S1 (AniList id 154587) has no season marker in any title; my code
  // treats this as "single season or unknown" and must reject any explicit
  // S2+ release.
  const titles = ['Sousou no Frieren', 'Frieren: Beyond Journey End', 'Frieren']
  const explicitS2 = /\b(?:2nd|3rd|4th) season\b|\bS0?[2-9]\b(?!\d)|\bS0?[2-9]E\d/i
  for (const [name, ext] of [['nekoBT', nekobt]]) {
    const r = await ext.single({ titles, episode: 1, resolution: '1080', exclusions: [], fetch: globalThis.fetch })
    log(`  ${name}: ${r.length} results`)
    for (const x of r) {
      // Allow combo batches like "S1+S2" (they contain S1), reject pure-S2 markers.
      const isMultiSeasonBatch = /\bS\d\+S\d\b|\bS01\+S02\b/i.test(x.title)
      if (!isMultiSeasonBatch) {
        assert.ok(!explicitS2.test(x.title), `${name}: leaked S2+ on Frieren S1 query: "${x.title}"`)
      }
    }
  }
}

async function run () {
  unitFilterChecks()
  await testNyaa()
  await testSeadex()
  await testAnimeTosho()
  await testSubsPlease()
  await testNekoBT()
  await testCoteS4()
  await testFrierenS1NoS2Leaks()
  log('\nall tests passed ✓')
}

run().catch(e => {
  console.error('\n[test] FAILED:', e)
  process.exit(1)
})
