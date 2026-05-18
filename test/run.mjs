import { strict as assert } from 'node:assert'
import nyaa from '../dist/nyaa.js'
import seadex from '../dist/seadex.js'
import animetosho from '../dist/animetosho.js'

const log = (...a) => console.log('[test]', ...a)
const section = name => log(`\n── ${name} ──`)

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

async function run () {
  await testNyaa()
  await testSeadex()
  await testAnimeTosho()
  log('\nall tests passed ✓')
}

run().catch(e => {
  console.error('\n[test] FAILED:', e)
  process.exit(1)
})
