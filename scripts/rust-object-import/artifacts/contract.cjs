const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../..');
const targets = {
  'x86_64-unknown-linux-gnu': { os: 'linux', arch: 'x64', abi: 'gnu' },
  'aarch64-unknown-linux-gnu': { os: 'linux', arch: 'arm64', abi: 'gnu' },
  'x86_64-unknown-linux-musl': { os: 'linux', arch: 'x64', abi: 'musl' },
  'x86_64-apple-darwin': { os: 'darwin', arch: 'x64', abi: 'darwin' },
  'aarch64-apple-darwin': { os: 'darwin', arch: 'arm64', abi: 'darwin' },
  'x86_64-pc-windows-msvc': { os: 'win32', arch: 'x64', abi: 'msvc' },
};
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const command = (args) =>
  execFileSync(args[0], args.slice(1), {
    cwd: path.join(ROOT, 'native'),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
const binaryName = (target) => (targets[target].os === 'win32' ? 'bit-object-import.exe' : 'bit-object-import');
const buildCommand = (target) => [
  'cargo',
  'build',
  '--locked',
  '--offline',
  '--release',
  '--package',
  'bit-object-import',
  '--target',
  target,
];

const addonName = 'bit-workspace.node';
const addonLibrary = (target) =>
  targets[target].os === 'win32'
    ? 'bit_workspace_napi.dll'
    : targets[target].os === 'darwin'
      ? 'libbit_workspace_napi.dylib'
      : 'libbit_workspace_napi.so';
const addonBuildCommand = (target) => [...buildCommand(target).slice(0, 6), 'bit-workspace-napi', '--target', target];
const addonRustFlags = (target) => (target.endsWith('-musl') ? '-C target-feature=-crt-static -C linker=cc' : '');
function verifyAddon(members, manifest) {
  const addon = members[addonName],
    target = manifest.target;
  assert.ok(addon, 'missing workspace addon');
  verifyBinary(addon, target);
  const expected = {
    name: addonName,
    bytes: addon.length,
    sha256: sha256(addon),
    napiVersion: 8,
    buildCommand: addonBuildCommand(target),
    rustFlags: addonRustFlags(target),
  };
  if (target.endsWith('-gnu')) expected.minimumGlibc = minimumGlibc(addon);
  assert.deepEqual(manifest.addon, expected, 'workspace addon metadata mismatch');
}

function sourceIdentity(root = ROOT) {
  const files = [
    'native/Cargo.toml',
    'native/Cargo.lock',
    'native/rust-toolchain.toml',
    'native/object-import/Cargo.toml',
  ];
  const visit = (relative) => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile() && entry.name.endsWith('.rs')) files.push(name);
    }
  };
  for (const directory of ['src', 'tests']) {
    const relative = `native/object-import/${directory}`;
    if (fs.existsSync(path.join(root, relative))) visit(relative);
  }
  if (fs.existsSync(path.join(root, 'native/object-import/build.rs'))) files.push('native/object-import/build.rs');
  if (fs.existsSync(path.join(root, 'native/workspace-napi'))) {
    files.push('native/workspace-napi/Cargo.toml', 'native/workspace-napi/build.rs');
    visit('native/workspace-napi/src');
  }
  if (fs.existsSync(path.join(root, 'native/dependency-scanner/src/lib.rs'))) {
    files.push('native/dependency-scanner/Cargo.toml');
    visit('native/dependency-scanner/src');
  }
  const digest = createHash('sha256');
  for (const name of files.sort()) {
    digest.update(name + '\0');
    digest.update(fs.readFileSync(path.join(root, name)).toString('utf8').replace(/\r\n/g, '\n'));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function minimumGlibc(binary) {
  const text = binary.toString('latin1');
  const versions = [...text.matchAll(/GLIBC_([0-9]+\.[0-9]+)/g)].map((match) => match[1]);
  if (text.includes('GLIBC_ABI_DT_RELR')) versions.push('2.36');
  assert.ok(versions.length, 'GNU binary lacks inspectable GLIBC requirements');
  return versions
    .sort((a, b) => {
      const x = a.split('.').map(Number),
        y = b.split('.').map(Number);
      return x[0] - y[0] || x[1] - y[1];
    })
    .at(-1);
}

function verifyBinary(binary, target) {
  assert.ok(targets[target], 'unsupported target');
  assert.ok(binary.length > 64 && binary.length <= 64 * 1024 * 1024, 'binary size out of bounds');
  const { os, arch } = targets[target];
  if (os === 'linux') {
    assert.ok(binary.subarray(0, 6).equals(Buffer.from([127, 69, 76, 70, 2, 1])), 'invalid ELF format');
    assert.equal(binary.readUInt16LE(18), arch === 'x64' ? 62 : 183, 'ELF architecture mismatch');
    if (target.endsWith('-musl'))
      assert.ok(!binary.includes(Buffer.from('GLIBC_')), 'GNU executable cannot be labeled musl');
  } else if (os === 'darwin') {
    assert.equal(binary.readUInt32LE(0), 0xfeedfacf, 'invalid Mach-O format');
    assert.equal(binary.readUInt32LE(4), arch === 'x64' ? 0x01000007 : 0x0100000c, 'Mach-O architecture mismatch');
  } else {
    assert.equal(binary.subarray(0, 2).toString(), 'MZ', 'invalid DOS format');
    const offset = binary.readUInt32LE(60);
    assert.ok(offset + 6 <= binary.length, 'invalid PE offset');
    assert.equal(binary.subarray(offset, offset + 4).toString(), 'PE\0\0', 'invalid PE format');
    assert.equal(binary.readUInt16LE(offset + 4), 0x8664, 'PE architecture mismatch');
  }
}

function verifyMembers(members) {
  assert.ok(members['manifest.json']?.length <= 65536, 'manifest size out of bounds');
  const manifest = JSON.parse(members['manifest.json']);
  const target = manifest.target;
  assert.ok(targets[target], 'unsupported target');
  assert.equal(manifest.name, 'bit-object-import');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.artifactFormat, 2);
  assert.equal(manifest.protocolVersion, 1);
  assert.deepEqual(manifest.platform, targets[target]);
  assert.match(manifest.gitRevision, /^[a-f0-9]{40}$/);
  assert.ok(
    Array.isArray(manifest.gitParents) && manifest.gitParents.every((parent) => /^[a-f0-9]{40}$/.test(parent)),
    'invalid parent revisions'
  );
  assert.match(manifest.objectImportSourceSha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.cargoLockSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.provenance?.binaryInput, 'checkout release output');
  assert.deepEqual(manifest.provenance?.buildCommand, buildCommand(target));
  if (target.endsWith('-gnu')) assert.match(manifest.minimumGlibc, /^[0-9]+\.[0-9]+$/);
  const name = binaryName(target);
  assert.deepEqual(
    Object.keys(members).sort(),
    ['LICENSE', 'THIRD-PARTY-NOTICES.txt', name, 'manifest.json', ...(manifest.addon ? [addonName] : [])].sort()
  );
  for (const [field, filename] of [
    ['license', 'LICENSE'],
    ['notices', 'THIRD-PARTY-NOTICES.txt'],
    ['binary', name],
  ]) {
    const data = members[filename];
    assert.ok(
      data.length > 0 && data.length <= (field === 'binary' ? 64 : 4) * 1024 * 1024,
      `${field} size out of bounds`
    );
    const expected = { name: filename, sha256: sha256(data) };
    if (field === 'binary') expected.bytes = data.length;
    assert.deepEqual(manifest[field], expected, `${field} checksum or metadata mismatch`);
  }
  if (manifest.addon) verifyAddon(members, manifest);
  verifyBinary(members[name], target);
  if (target.endsWith('-gnu'))
    assert.equal(manifest.minimumGlibc, minimumGlibc(members[name]), 'GLIBC requirement mismatch');
  return manifest;
}
module.exports = {
  ROOT,
  targets,
  sha256,
  command,
  binaryName,
  addonName,
  addonLibrary,
  addonBuildCommand,
  addonRustFlags,
  buildCommand,
  sourceIdentity,
  verifyBinary,
  verifyMembers,
  minimumGlibc,
};
