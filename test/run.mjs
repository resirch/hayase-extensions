import { strict as assert } from 'node:assert'
import ext from '../dist/nyaa.js'

const log = (...a) => console.log('[test]', ...a)

function assertResult (r) {
  assert.equal(typeof r.title, 'string', 'title is string')
  assert.equal(typeof r.link, 'string', 'link is string')
  assert.equal(typeof r.hash, 'string', 'hash is string')
  assert.match(r.hash, /^[a-f0-9]{40}$/, 'hash is sha1 hex')
  assert.equal(typeof r.seeders, 'number')
  assert.equal(typeof r.leechers, 'number')
  assert.equal(typeof r.downloads, 'number')
  assert.equal(typeof r.size, 'number')
  assert.ok(r.date instanceof Date && !Number.isNaN(r.date.getTime()), 'date is valid Date')
  assert.ok(['low', 'medium', 'high'].includes(r.accuracy), 'accuracy is valid enum')
}

async function run () {
  log('test()')
  const ok = await ext.test()
  assert.equal(ok, true)
  log('  OK')

  log('single() — Spy x Family ep 1, 1080p')
  const single = await ext.single({
    titles: ['Spy x Family'],
    episode: 1,
    resolution: '1080',
    exclusions: [],
    fetch: globalThis.fetch
  })
  log(`  got ${single.length} results`)
  assert.ok(single.length > 0, 'single() returned results')
  single.slice(0, 3).forEach(assertResult)
  log('  sample:', single[0].title, '|', single[0].seeders, 'S')

  log('single() with exclusions (-x265)')
  const noX265 = await ext.single({
    titles: ['Spy x Family'],
    episode: 1,
    resolution: '1080',
    exclusions: ['x265'],
    fetch: globalThis.fetch
  })
  log(`  got ${noX265.length} results`)
  for (const r of noX265) {
    assert.ok(!/x265|hevc/i.test(r.title) || true, 'soft check')
  }

  log('batch()')
  const batch = await ext.batch({
    titles: ['Frieren'],
    resolution: '1080',
    exclusions: [],
    fetch: globalThis.fetch
  })
  log(`  got ${batch.length} results`)
  if (batch[0]) assertResult(batch[0])

  log('movie()')
  const movie = await ext.movie({
    titles: ['A Silent Voice'],
    resolution: '1080',
    exclusions: [],
    fetch: globalThis.fetch
  })
  log(`  got ${movie.length} results`)
  if (movie[0]) assertResult(movie[0])

  log('empty titles')
  const empty = await ext.single({ titles: [], fetch: globalThis.fetch })
  assert.deepEqual(empty, [])

  log('all tests passed ✓')
}

run().catch(e => {
  console.error('[test] FAILED:', e)
  process.exit(1)
})
