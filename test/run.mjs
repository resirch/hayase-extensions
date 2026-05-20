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

  const batch = await nekobt.batch({
    titles: ['Frieren'], resolution: '1080', exclusions: [], fetch: globalThis.fetch
  })
  log(`  batch(Frieren) → ${batch.length} results`)
  assert.ok(batch.length > 0, 'batch() should find season packs')
  batch.slice(0, 3).forEach(r => {
    assertCommon(r)
    assert.equal(r.type, 'batch')
    assert.match(r.title, /\b(?:batch|complete|season|s\d{1,2}|bd|cour|collection)\b/i)
  })

  log('  empty titles → []')
  assert.deepEqual(await nekobt.single({ titles: [], fetch: globalThis.fetch }), [])
}

async function run () {
  unitFilterChecks()
  await testNyaa()
  await testSeadex()
  await testAnimeTosho()
  await testSubsPlease()
  await testNekoBT()
  log('\nall tests passed ✓')
}

run().catch(e => {
  console.error('\n[test] FAILED:', e)
  process.exit(1)
})
