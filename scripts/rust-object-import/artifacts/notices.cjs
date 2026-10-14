// Reuse the scanner's pinned upstream license texts, without its Python tooling.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, sha256, command } = require('./contract.cjs');
const licenseRoot = path.join(ROOT, 'scripts/rust-dependency-analysis/artifacts/licenses');
// pnpm's engine is a git dependency at this revision (`native/Cargo.toml`). Its crates carry
// no per-crate license file: the MIT `pnpm-*` crates are covered by the repository root
// LICENSE and the `pnpr-*` crates name their `license-file`.
const PNPM_REVISION = '343f3c4198b43dce5e58bc7de9927cb96aed59fc';
const PNPM_SOURCE = `git+https://github.com/pnpm/pnpm?rev=${PNPM_REVISION}#${PNPM_REVISION}`;


function dependencyInventory(metadata) {
  const root = metadata.packages.find((entry) => entry.name === 'bit-object-import' && entry.source === null);
  assert.ok(root, 'missing object-import package');
  const nodes = new Map(metadata.resolve.nodes.map((entry) => [entry.id, entry]));
  const selected = new Set();
  const visit = (id) => {
    if (selected.has(id)) return;
    selected.add(id);
    assert.ok(nodes.has(id), 'incomplete locked dependency graph');
    nodes.get(id).dependencies.forEach(visit);
  };
  visit(root.id);
  const addon = metadata.packages.find((entry) => entry.name === 'bit-workspace-napi' && entry.source === null);
  if (addon) visit(addon.id);
  return metadata.packages
    .filter((entry) => selected.has(entry.id) && entry.source !== null)
    .sort((a, b) => `${a.name} ${a.version}`.localeCompare(`${b.name} ${b.version}`, 'en'));
}

function notices(target, compiler) {
  const sources = JSON.parse(fs.readFileSync(path.join(licenseRoot, 'sources.json'), 'utf8'));
  const napiRevisions = Object.fromEntries(Object.entries(sources.find(entry => entry.name === 'napi-rs-MIT.txt').packages).map(([name, pin]) => [name, [pin.version, pin.revision]]));
  const pinned = (name) => {
    const entry = sources.find((source) => source.name === name);
    assert.ok(entry && path.basename(name) === name, 'unrecognized vendored license');
    const data = fs.readFileSync(path.join(licenseRoot, name));
    assert.equal(sha256(data), entry.sha256, 'vendored license checksum mismatch');
    return data.toString('utf8');
  };
  const metadata = JSON.parse(
    command(['cargo', 'metadata', '--locked', '--offline', '--format-version', '1', '--filter-platform', target])
  );
  const blocks = [
    'Third-party notices for bit-object-import\nIncludes conservative locked runtime/build dependencies for this target.\n',
  ];
  const dependencies = dependencyInventory(metadata);
  // Hundreds of crates repeat the same license files; each distinct text is written once and
  // later entries reference it by digest, which keeps the notices within the 4 MiB bound that
  // installation and runtime discovery verify.
  const seen = new Map();
  const text = (label, data, owner) => {
    const bytes = Buffer.from(data);
    const digest = sha256(bytes);
    const first = seen.get(digest);
    if (first) return `\n--- ${label} (SHA256 ${digest}) ---\nSame text as listed for ${first}.\n`;
    seen.set(digest, owner);
    return `\n--- ${label} (SHA256 ${digest}) ---\n${bytes.toString('utf8')}`;
  };
  for (const entry of dependencies) {
    const directory = path.dirname(entry.manifest_path);
    const owner = `${entry.name} ${entry.version}`;
    const files = fs
      .readdirSync(directory)
      .filter((name) => /^(LICENSE|COPYING|NOTICE)/i.test(name) && fs.statSync(path.join(directory, name)).isFile())
      .sort();
    if (!files.length && entry.name.startsWith('oxc_')) {
      const index = entry.name === 'oxc_index';
      const revision = index ? '8e09fe324eb6df02f56e4eacdfac958930300380' : '7f56ec9301e7327b4402c3010c87803b58b6ea30';
      assert.equal(JSON.parse(fs.readFileSync(path.join(directory, '.cargo_vcs_info.json'))).git.sha1, revision,
        'OXC license fallback revision mismatch');
      assert.equal(entry.license, 'MIT');
      const name = index ? 'oxc-index-MIT.txt' : 'oxc-MIT.txt';
      blocks.push(`\n=== ${entry.name} ${entry.version} ===\nSPDX: MIT\nRepository: ${entry.repository}\n` +
        text(name, pinned(name), owner));
      continue;
    }
    if (!files.length && Object.hasOwn(napiRevisions, entry.name)) {
      const [version, revision] = napiRevisions[entry.name];
      assert.equal(entry.version, version, 'update pinned napi-rs notices after upgrading');
      assert.equal(entry.license, 'MIT');
      assert.equal(entry.repository, 'https://github.com/napi-rs/napi-rs');
      assert.equal(JSON.parse(fs.readFileSync(path.join(directory, '.cargo_vcs_info.json'))).git.sha1, revision);
      blocks.push(`\n=== ${entry.name} ${entry.version} ===\nSPDX: MIT\nRepository: ${entry.repository}\n` +
        text('napi-rs-MIT.txt', pinned('napi-rs-MIT.txt'), owner));
      continue;
    }
    if (!files.length && entry.source === PNPM_SOURCE) {
      blocks.push(`\n=== ${entry.name} ${entry.version} ===\nSPDX: ${entry.license ?? 'see license file'}\n` +
        `Repository: https://github.com/pnpm/pnpm (${PNPM_REVISION})\n` +
        text('LICENSE', pnpmLicense(entry, directory, sources, pinned), owner));
      continue;
    }
    const fallbacks = packageFallbacks(entry, directory, sources);
    if (!files.length && fallbacks.length) {
      blocks.push(`\n=== ${entry.name} ${entry.version} ===\nSPDX: ${entry.license}\nRepository: ${entry.repository || ''}\n` +
        `Copyright holders (crate authors): ${entry.authors.join(', ') || 'see repository'}\n` +
        fallbacks.map((name) => text(name, pinned(name), owner)).join(''));
      continue;
    }
    assert.ok(files.length, `missing license text: ${entry.name} ${entry.version}`);
    blocks.push(
      `\n=== ${entry.name} ${entry.version} ===\nSPDX: ${entry.license}\nRepository: ${entry.repository || ''}\n`
    );
    for (const name of files) blocks.push(text(name, fs.readFileSync(path.join(directory, name)), owner));
  }
  assert.ok(
    compiler.includes('commit-hash: 2d8144b7880597b6e6d3dfd63a9a9efae3f533d3'),
    'Rust notice revision mismatch; update pinned licenses with toolchain'
  );
  for (const name of ['LICENSE-APACHE', 'LICENSE-MIT', 'COPYRIGHT'])
    blocks.push(`\n=== Rust standard library ${name} ===\n${pinned('rust-' + name)}`);
  const sysroot = command(['rustc', '--print', 'sysroot']);
  blocks.push(
    '\n=== Rust standard library complete third-party copyright inventory (HTML) ===\n' +
      fs.readFileSync(path.join(sysroot, 'share/doc/rust/COPYRIGHT-library.html'), 'utf8')
  );
  const extras = ['llvm-LICENSE.TXT'];
  if (target.endsWith('-musl')) extras.push('musl-COPYRIGHT', 'gcc-COPYING.RUNTIME', 'gcc-COPYING3');
  for (const name of extras) blocks.push(`\n=== Conservative native runtime notice: ${name} ===\n${pinned(name)}`);
  const data = Buffer.from(blocks.join('\n'));
  assert.ok(data.length <= 4 * 1024 * 1024, 'third-party notices exceed limit');
  return { data, dependencies: dependencies.map(({ name, version, license }) => ({ name, version, license })) };
}
/** The pinned license text of a crate from pnpm's engine checkout, verified against the checkout. */
function pnpmLicense(entry, directory, sources, pinned) {
  if (entry.license_file) {
    const actual = sha256(fs.readFileSync(path.resolve(directory, entry.license_file)));
    const source = sources.find((candidate) => candidate.gitRevision === PNPM_REVISION && candidate.sha256 === actual);
    assert.ok(source, `unpinned pnpm license file: ${entry.name} ${entry.license_file}`);
    return pinned(source.name);
  }
  assert.equal(entry.license, 'MIT', `unexpected pnpm crate license: ${entry.name}`);
  // `<checkout>/pnpm/crates/<crate>/Cargo.toml`
  const root = path.resolve(directory, '..', '..', '..');
  const vendored = sources.find((source) => source.name === 'pnpm-MIT.txt');
  assert.equal(sha256(fs.readFileSync(path.join(root, 'LICENSE'))), vendored.sha256,
    'pnpm license changed; update the vendored copy with the engine pin');
  return pinned('pnpm-MIT.txt');
}

/** Vendored texts pinned for a crate that publishes no license file (`packages` in sources.json). */
function packageFallbacks(entry, directory, sources) {
  const matches = sources.filter((source) => source.name !== 'napi-rs-MIT.txt' && source.packages?.[entry.name]);
  for (const source of matches) {
    const pin = source.packages[entry.name];
    assert.equal(entry.version, pin.version, `update the pinned ${source.name} notice for ${entry.name}`);
    if (pin.revision) {
      const vcs = JSON.parse(fs.readFileSync(path.join(directory, '.cargo_vcs_info.json'))).git;
      assert.equal(vcs.sha1, pin.revision, `${entry.name} license fallback revision mismatch`);
    }
  }
  return matches.map((source) => source.name);
}

module.exports = { notices, dependencyInventory };
