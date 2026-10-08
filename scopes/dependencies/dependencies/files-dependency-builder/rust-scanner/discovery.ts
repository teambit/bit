import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export const PACKAGED_SCANNER_VERSION = '0.1.0';
export const PACKAGED_SCANNER_PROTOCOL = 1;
let verifiedBuild: { fingerprint: string; matches: boolean } | undefined;
let host: { platform: string; arch: string; getReport: unknown; header?: { glibcVersionRuntime?: string } } | undefined;
let validated: { directory: string; fingerprint: string; executable: string } | undefined;

/** Only the installed runtime's adjacent directory is searched, never a workspace or PATH. */
export function resolveRustDependencyScannerExecutable(): string | undefined {
  const configured = process.env.BIT_RUST_DEPENDENCY_SCANNER;
  if (!configured || configured === 'off') return undefined;
  const fallback = (reason: string) => {
    require('debug')('precinct')(`Rust extraction fallback: ${reason}`);
    return undefined;
  };
  if (configured !== 'packaged') {
    return path.isAbsolute(configured) ? configured : fallback('scanner override must be absolute, packaged, or off');
  }
  try {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 13)) return fallback('packaged scanner requires Node >=22.13.0');
    const target = packagedScannerTarget();
    if (!target) return fallback('packaged scanner does not support this host');
    const root = path.join(__dirname, 'packaged');
    if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink())
      return fallback('packaged root redirect');
    const selectionPath = path.join(root, 'current.json');
    const read = (filename: string, limit: number) => {
      const stat = fs.lstatSync(filename);
      if (!stat.isFile() || stat.size > limit) throw new Error('invalid packaged scanner file');
      const data = fs.readFileSync(filename);
      if (data.length > limit) throw new Error('packaged scanner size limit exceeded');
      return data;
    };
    const selection = JSON.parse(read(selectionPath, 4096).toString('utf8'));
    if (
      selection.version !== PACKAGED_SCANNER_VERSION ||
      selection.target !== target ||
      !/^[a-f0-9]{40}$/.test(selection.revision)
    ) {
      return fallback('packaged scanner selection version or target mismatch');
    }
    const directory = path.join(root, PACKAGED_SCANNER_VERSION, target, selection.revision);
    // Reject redirects outside the installed package; symlinked package roots themselves are normal.
    if (
      fs.realpathSync(directory) !==
      path.join(fs.realpathSync(root), PACKAGED_SCANNER_VERSION, target, selection.revision)
    ) {
      return fallback('packaged scanner directory redirect');
    }
    const manifestBytes = read(path.join(directory, 'manifest.json'), 65536);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (
      !matchesPackagedBuild(
        read(path.join(__dirname, 'packaged-build.json'), 65536),
        manifestBytes,
        manifest,
        selection
      )
    )
      return fallback('packaged scanner does not match assembled runtime build');
    const filename = process.platform === 'win32' ? 'bit-dependency-scanner.exe' : 'bit-dependency-scanner';
    if (!matchesPackagedContract(manifest, selection.revision, target, filename))
      return fallback('packaged scanner manifest contract mismatch');
    if (target.endsWith('-gnu')) {
      const runtime = hostHeader()?.glibcVersionRuntime;
      if (!runtime || !/^[0-9]+\.[0-9]+$/.test(manifest.minimumGlibc || ''))
        return fallback('packaged scanner lacks a GLIBC compatibility contract');
      const [requiredMajor, requiredMinor] = manifest.minimumGlibc.split('.').map(Number);
      const [actualMajor, actualMinor] = runtime.split('.').map(Number);
      if (actualMajor < requiredMajor || (actualMajor === requiredMajor && actualMinor < requiredMinor)) {
        return fallback(`packaged scanner requires GLIBC >=${manifest.minimumGlibc}`);
      }
    }
    const executable = path.join(directory, filename);
    const fingerprint = JSON.stringify([
      manifest,
      ...[executable, path.join(directory, 'LICENSE'), path.join(directory, 'THIRD-PARTY-NOTICES.txt')].map(
        (filePath) => {
          const stat = fs.lstatSync(filePath);
          if (!stat.isFile()) throw new Error('packaged file redirect');
          return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs];
        }
      ),
    ]);
    if (validated?.directory === directory && validated.fingerprint === fingerprint) return validated.executable;
    const binary = read(executable, 64 * 1024 * 1024);
    if (
      manifest.binary.bytes !== binary.length ||
      manifest.binary.sha256 !== createHash('sha256').update(binary).digest('hex')
    ) {
      return fallback('packaged scanner binary checksum mismatch');
    }
    for (const field of ['license', 'notices']) {
      const name = field === 'license' ? 'LICENSE' : 'THIRD-PARTY-NOTICES.txt';
      const data = read(path.join(directory, name), 4 * 1024 * 1024);
      if (
        manifest[field]?.name !== name ||
        manifest[field]?.sha256 !== createHash('sha256').update(data).digest('hex')
      ) {
        return fallback('packaged scanner license or notices checksum mismatch');
      }
    }
    validated = { directory, fingerprint, executable: path.toNamespacedPath(executable) };
    return validated.executable;
  } catch (error) {
    return fallback(`packaged scanner unavailable: ${(error as Error).message}`);
  }
}

function matchesPackagedBuild(
  contractBytes: Buffer,
  manifestBytes: Buffer,
  manifest: { scannerSourceSha256?: string; binary?: { sha256?: string } },
  selection: { version: string; target: string; revision: string }
): boolean {
  const contract = JSON.parse(contractBytes.toString('utf8'));
  if (
    contract.format !== 1 ||
    !/^[a-f0-9]{64}$/.test(contract.scannerSourceSha256) ||
    contract.scannerSourceSha256 !== manifest.scannerSourceSha256
  )
    return false;
  const expected = {
    ...selection,
    binarySha256: manifest.binary?.sha256,
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  };
  if (
    !Array.isArray(contract.artifacts) ||
    !contract.artifacts.some((entry: Record<string, unknown>) =>
      Object.keys(expected).every((key) => entry[key] === expected[key as keyof typeof expected])
    )
  )
    return false;
  if (!contract.modules?.['discovery.js'] || !contract.modules?.['session.js']) return false;
  const files = Object.entries(contract.modules).map(([filename, digest]) => {
    const allowed =
      /^[A-Za-z0-9_.-]+\.js$/.test(filename) ||
      [
        '../generate-tree-madge.js',
        '../precinct/index.js',
        '../dependency-tree/index.js',
        '../dependency-tree/Config.js',
      ].includes(filename);
    if (!allowed) throw new Error('invalid runtime build module path');
    const file = path.join(__dirname, filename);
    const stat = fs.lstatSync(file);
    if (
      !stat.isFile() ||
      stat.size > 4 * 1024 * 1024 ||
      fs.realpathSync(file) !== path.resolve(fs.realpathSync(__dirname), filename)
    )
      throw new Error('runtime build module redirect');
    return { file, digest, stamp: [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs] };
  });
  const fingerprint = JSON.stringify([contract, files.map((file) => file.stamp)]);
  if (verifiedBuild?.fingerprint === fingerprint) return verifiedBuild.matches;
  const matches = files.every(
    ({ file, digest }) => createHash('sha256').update(fs.readFileSync(file)).digest('hex') === digest
  );
  verifiedBuild = { fingerprint, matches };
  return matches;
}

function matchesPackagedContract(
  manifest: {
    name?: unknown;
    version?: unknown;
    artifactFormat?: unknown;
    protocolVersion?: unknown;
    target?: unknown;
    gitRevision?: unknown;
    binary?: { name?: unknown };
    platform?: { os?: unknown; arch?: unknown };
    provenance?: { binaryInput?: unknown; buildCommand?: unknown };
  },
  revision: string,
  target: string,
  filename: string
): boolean {
  return !(
    manifest.name !== 'bit-dependency-scanner' ||
    manifest.version !== PACKAGED_SCANNER_VERSION ||
    manifest.artifactFormat !== 2 ||
    manifest.protocolVersion !== PACKAGED_SCANNER_PROTOCOL ||
    manifest.target !== target ||
    manifest.gitRevision !== revision ||
    manifest.binary?.name !== filename ||
    manifest.platform?.os !== process.platform ||
    manifest.platform?.arch !== process.arch ||
    manifest.provenance?.binaryInput !== 'checkout release output' ||
    JSON.stringify(manifest.provenance?.buildCommand) !==
      JSON.stringify(['cargo', 'build', '--locked', '--offline', '--release', '--workspace', '--target', target])
  );
}

export function packagedScannerTarget(): string | undefined {
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
