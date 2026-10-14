// pnpm's `deps-restorer` crate embeds `cas-loader.mjs.inc`, a bundle pnpm builds
// during its own release and does not commit. Bit pins pnpm as a git dependency,
// so the file is missing from the checkout. It is only used by pnpm's
// experimental CAS store loader, which Bit never enables: write a stub that fails
// loudly if it ever runs. Run from anywhere before building `native/`.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const native = fileURLToPath(new URL('../../native/', import.meta.url))
const metadata = spawnSync('cargo', ['metadata', '--format-version', '1', '--locked'], {
  cwd: native,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'inherit'],
})
if (metadata.status !== 0) process.exit(metadata.status ?? 1)
const restorer = JSON.parse(metadata.stdout).packages.find((pkg) => pkg.name === 'pnpm-deps-restorer')
if (restorer == null) throw new Error('pnpm-deps-restorer is not in the native dependency graph')
const loader = path.join(path.dirname(restorer.manifest_path), 'src', 'cas-loader.mjs.inc')
if (!fs.existsSync(loader)) {
  fs.writeFileSync(loader, "throw new Error('bit does not support the pnpm CAS store loader')\n")
}
