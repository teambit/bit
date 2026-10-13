import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import { verifyPackagedFiles } from './rust-artifact-verification';

export const OBJECT_IMPORT_VERSION = '0.1.0';
export const OBJECT_IMPORT_RUNTIME_MODULES = [
  'rust-object-package.js',
  'rust-artifact-verification.js',
  'rust-object-discovery.js',
  'rust-object-inventory.js',
  'rust-object-reader.js',
  'rust-object-directory.js',
  'rust-object-operation.js',
  'repository.js',
  'object.js',
  'scope-index.js',
  'object-list.js',
  'tar-input-stream.js',
  'ref.js',
  '../index.js',
  '../models/version.js',
  '../models/version-history.js',
  '../models/lane-history.js',
  '../models/model-component.js',
  '../models/detach-heads.js',
];
export const OBJECT_IMPORT_LEGACY_MODULES = [
  'rust-source-validator.js',
  'rust-object-importer.js',
  'rust-tar-client.js',
  'rust-import-transport.js',
  'rust-tar-importer.js',
  'rust-tar-transfer.js',
  'rust-tar-staging.js',
  'rust-tar-stream.js',
  'objects-fetcher.js',
  'import-cancellation.js',
  'objects-writable-stream.js',
  'write-objects-queue.js',
  '../component-ops/scope-components-importer.js',
  '../component-ops/model-components-merger.js',
  '../component-ops/multiple-component-merger.js',
];
export const OBJECT_IMPORT_NETWORK_MODULES = ['http.js'];
export type ObjectHelperSelection = { version: string; target: string; revision: string };
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
let verifiedRuntime: { fingerprint: string; matches: boolean } | undefined;
let host: { platform: string; arch: string; getReport: unknown; header?: { glibcVersionRuntime?: string } } | undefined;

export function readPackagedFile(filename: string, limit: number): Buffer {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.size > limit) throw new Error('invalid packaged file');
  const data = fs.readFileSync(filename);
  if (data.length > limit) throw new Error('packaged file exceeds limit');
  return data;
}

export function validObjectSelection(value: ObjectHelperSelection): boolean {
  return Boolean(
    value &&
      value.version === OBJECT_IMPORT_VERSION &&
      typeof value.target === 'string' &&
      /^[a-f0-9]{40}$/.test(value.revision)
  );
}

export function packagedObjectTarget(): string | undefined {
  if (process.platform === 'linux') {
    const header = hostHeader();
    if (!header) return undefined;
    const abi = header.glibcVersionRuntime ? 'gnu' : 'musl';
    if (process.arch === 'x64') return `x86_64-unknown-linux-${abi}`;
    if (process.arch === 'arm64' && abi === 'gnu') return 'aarch64-unknown-linux-gnu';
  }
  if (process.platform === 'darwin') {
    if (process.arch === 'x64') return 'x86_64-apple-darwin';
    if (process.arch === 'arm64') return 'aarch64-apple-darwin';
  }
  if (process.platform === 'win32' && process.arch === 'x64') return 'x86_64-pc-windows-msvc';
  return undefined;
}

function hostHeader(): { glibcVersionRuntime?: string } | undefined {
  const getReport = process.report?.getReport;
  if (!host || host.platform !== process.platform || host.arch !== process.arch || host.getReport !== getReport) {
    const report = getReport?.call(process.report) as { header?: { glibcVersionRuntime?: string } } | undefined;
    host = { platform: process.platform, arch: process.arch, getReport, header: report?.header };
  }
  return host.header;
}

export function objectRuntimeMatches(
  directory: string,
  manifestBytes: Buffer,
  manifest: any,
  selection: ObjectHelperSelection,
  importing: boolean
): boolean {
  const contract = JSON.parse(readPackagedFile(path.join(directory, 'packaged-build.json'), 65536).toString('utf8'));
  if (
    contract.format !== 1 ||
    !/^[a-f0-9]{64}$/.test(contract.objectImportSourceSha256) ||
    contract.objectImportSourceSha256 !== manifest.objectImportSourceSha256
  )
    return false;
  const expected = { ...selection, binarySha256: manifest.binary?.sha256, manifestSha256: digest(manifestBytes) };
  if (
    !Array.isArray(contract.artifacts) ||
    !contract.artifacts.some((entry: any) =>
      Object.keys(expected).every((key) => entry[key] === expected[key as keyof typeof expected])
    )
  )
    return false;
  const modules = runtimeFiles(directory, contract.modules, OBJECT_IMPORT_RUNTIME_MODULES);
  if (importing) {
    const entry = require.resolve('@teambit/legacy.scope');
    const legacy = path.join(path.dirname(entry), 'objects-fetcher');
    modules.push(...runtimeFiles(legacy, contract.legacyModules, OBJECT_IMPORT_LEGACY_MODULES));
    const network = path.join(path.dirname(createRequire(entry).resolve('@teambit/scope.network')), 'http');
    modules.push(...runtimeFiles(network, contract.networkModules, OBJECT_IMPORT_NETWORK_MODULES));
  }
  const fingerprint = JSON.stringify([directory, importing, contract, modules.map(({ file, stamp }) => [file, stamp])]);
  if (verifiedRuntime?.fingerprint === fingerprint) return verifiedRuntime.matches;
  const matches = modules.every(
    ({ file, expected: moduleDigest }) => digest(readPackagedFile(file, 4 * 1024 * 1024)) === moduleDigest
  );
  verifiedRuntime = { fingerprint, matches };
  return matches;
}

function runtimeFiles(directory: string, hashes: Record<string, string>, names: string[]) {
  if (!hashes || JSON.stringify(Object.keys(hashes).sort()) !== JSON.stringify([...names].sort()))
    throw new Error('runtime module contract mismatch');
  const root = fs.realpathSync(directory);
  return names.map((name) => {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (
      !/^[a-f0-9]{64}$/.test(hashes[name]) ||
      !stat.isFile() ||
      stat.size > 4 * 1024 * 1024 ||
      fs.realpathSync(file) !== path.resolve(root, name)
    )
      throw new Error('runtime module redirect or bounds');
    return { file, expected: hashes[name], stamp: [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs] };
  });
}

export function objectArtifactExecutable(
  directory: string,
  manifest: any,
  selection: ObjectHelperSelection
): string | undefined {
  const filename = process.platform === 'win32' ? 'bit-object-import.exe' : 'bit-object-import';
  if (
    manifest.name !== 'bit-object-import' ||
    manifest.version !== OBJECT_IMPORT_VERSION ||
    manifest.artifactFormat !== 2 ||
    manifest.protocolVersion !== 1 ||
    manifest.target !== selection.target ||
    manifest.gitRevision !== selection.revision ||
    manifest.platform?.os !== process.platform ||
    manifest.platform?.arch !== process.arch ||
    manifest.binary?.name !== filename ||
    manifest.provenance?.binaryInput !== 'checkout release output' ||
    JSON.stringify(manifest.provenance?.buildCommand) !==
      JSON.stringify([
        'cargo',
        'build',
        '--locked',
        '--offline',
        '--release',
        '--package',
        'bit-object-import',
        '--target',
        selection.target,
      ])
  )
    return undefined;
  if (selection.target.endsWith('-gnu')) {
    const runtime = hostHeader()?.glibcVersionRuntime;
    if (!runtime || !/^[0-9]+\.[0-9]+$/.test(manifest.minimumGlibc || '')) return undefined;
    const [requiredMajor, requiredMinor] = manifest.minimumGlibc.split('.').map(Number);
    const [actualMajor, actualMinor] = runtime.split('.').map(Number);
    if (actualMajor < requiredMajor || (actualMajor === requiredMajor && actualMinor < requiredMinor)) return undefined;
  }
  const executable = path.join(directory, filename);
  const files = [filename, 'LICENSE', 'THIRD-PARTY-NOTICES.txt'];
  const fields = ['binary', 'license', 'notices'];
  if (fields.some((field, index) => manifest[field]?.name !== files[index])) return undefined;
  if (
    !Number.isSafeInteger(manifest.binary.bytes) ||
    manifest.binary.bytes < 0 ||
    !verifyPackagedFiles(
      fields.map((field, index) => ({
        filename: path.join(directory, files[index]),
        sha256: manifest[field].sha256,
        limit: (index === 0 ? 64 : 4) * 1024 * 1024,
        bytes: index === 0 ? manifest.binary.bytes : undefined,
      }))
    )
  )
    return undefined;
  return path.toNamespacedPath(executable);
}

/** A companion addon must match the same verified helper artifact and supported Node-API version. */
export function objectArtifactAddon(executable: string): string | undefined {
  const directory = path.dirname(executable);
  const manifest = JSON.parse(readPackagedFile(path.join(directory, 'manifest.json'), 65536).toString('utf8'));
  const target = packagedObjectTarget();
  const selection = { version: manifest.version, target: manifest.target, revision: manifest.gitRevision };
  if (
    !validObjectSelection(selection) ||
    selection.target !== target ||
    objectArtifactExecutable(directory, manifest, selection) !== path.toNamespacedPath(executable) ||
    manifest.addon?.name !== 'bit-workspace.node' ||
    manifest.addon?.napiVersion !== 8 ||
    !(Number(process.versions.napi) >= 8) ||
    !/^[a-f0-9]{64}$/.test(manifest.addon.sha256)
  )
    return undefined;
  if (target?.endsWith('-gnu')) {
    const actual = hostHeader()?.glibcVersionRuntime?.split('.').map(Number);
    if (!actual || !/^[0-9]+\.[0-9]+$/.test(manifest.addon.minimumGlibc || '')) return undefined;
    const required = manifest.addon.minimumGlibc.split('.').map(Number);
    if (actual[0] < required[0] || (actual[0] === required[0] && actual[1] < required[1])) return undefined;
  }
  const filename = path.join(directory, 'bit-workspace.node');
  if (!Number.isSafeInteger(manifest.addon.bytes) || manifest.addon.bytes < 0) return undefined;
  return verifyPackagedFiles([
    { filename, sha256: manifest.addon.sha256, bytes: manifest.addon.bytes, limit: 64 * 1024 * 1024 },
  ])
    ? filename
    : undefined;
}
