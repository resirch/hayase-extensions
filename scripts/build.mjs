import { build } from 'esbuild'
import { readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const srcDir = 'src'
const outDir = 'dist'
const minify = process.argv.includes('--minify')

await mkdir(outDir, { recursive: true })

const entries = (await readdir(srcDir)).filter(f => f.endsWith('.js'))

for (const file of entries) {
  await build({
    entryPoints: [join(srcDir, file)],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    platform: 'neutral',
    outfile: join(outDir, file),
    minify,
    logLevel: 'warning'
  })
  console.log(`  built ${file}${minify ? ' (min)' : ''}`)
}
