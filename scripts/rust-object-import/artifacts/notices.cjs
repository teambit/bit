// Reuse the scanner's pinned upstream license texts, without its Python tooling.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, sha256, command } = require('./contract.cjs');
const licenseRoot = path.join(ROOT, 'scripts/rust-dependency-analysis/artifacts/licenses');


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
  for (const entry of dependencies) {
    const directory = path.dirname(entry.manifest_path);
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
      blocks.push(`\n=== ${entry.name} ${entry.version} ===\nSPDX: MIT\nRepository: ${entry.repository}\n` +
        pinned(index ? 'oxc-index-MIT.txt' : 'oxc-MIT.txt'));
      continue;
    }
    if (!files.length && Object.hasOwn(napiRevisions, entry.name)) {
      const [version, revision] = napiRevisions[entry.name];
      assert.equal(entry.version, version, 'update pinned napi-rs notices after upgrading');
      assert.equal(entry.license, 'MIT');
      assert.equal(entry.repository, 'https://github.com/napi-rs/napi-rs');
      assert.equal(JSON.parse(fs.readFileSync(path.join(directory, '.cargo_vcs_info.json'))).git.sha1, revision);
      blocks.push(`\n=== ${entry.name} ${entry.version} ===\nSPDX: MIT\nRepository: ${entry.repository}\n` + pinned('napi-rs-MIT.txt'));
      continue;
    }
    assert.ok(files.length, `missing license text: ${entry.name} ${entry.version}`);
    blocks.push(
      `\n=== ${entry.name} ${entry.version} ===\nSPDX: ${entry.license}\nRepository: ${entry.repository || ''}\n`
    );
    for (const name of files) {
      const data = fs.readFileSync(path.join(directory, name));
      blocks.push(`\n--- ${name} (SHA256 ${sha256(data)}) ---\n${data.toString('utf8')}`);
    }
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
module.exports = { notices, dependencyInventory };
