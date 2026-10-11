// Release-time provisioning from successful same-repository push/dispatch CI builds only.
// Runtime discovery never downloads. GitHub credentials never follow artifact redirects.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { targets, command, sha256, sourceIdentity } = require('./contract.cjs');
const { verifiedArchive } = require('./smoke.cjs');
const repositories = new Set(['teambit/bit', 'zkochan/bit']);
const workflow = '.github/workflows/rust-dependency-scanner.yml';
const MAX_ZIP = 80 * 1024 * 1024;
function artifactName(target, revision) {
  assert.ok(Object.hasOwn(targets, target), 'unsupported provisioning target');
  assert.match(revision, /^[a-f0-9]{40}$/);
  if (target.endsWith('-musl')) return `object-import-musl-node-22.22.0-${revision}`;
  const { os, arch } = targets[target];
  return `object-import-${{ linux: 'Linux', darwin: 'macOS', win32: 'Windows' }[os]}-${arch === 'arm64' ? 'ARM64' : 'X64'}-${revision}`;
}
function trustedArtifact(artifact, run, repository, revision, name) {
  assert.ok(repositories.has(repository));
  assert.equal(artifact.name, name);
  assert.equal(artifact.expired, false);
  assert.ok(Number.isSafeInteger(artifact.id) && artifact.id > 0);
  assert.ok(
    Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= MAX_ZIP
  );
  assert.match(artifact.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(artifact.workflow_run.head_sha, revision);
  assert.equal(artifact.workflow_run.repository_id, artifact.workflow_run.head_repository_id);
  assert.equal(run.id, artifact.workflow_run.id);
  assert.equal(run.repository.full_name, repository);
  assert.equal(run.head_repository.full_name, repository);
  assert.equal(run.repository.id, artifact.workflow_run.repository_id);
  assert.equal(run.head_sha, revision);
  assert.equal(run.path, workflow);
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  assert.ok(['push', 'workflow_dispatch'].includes(run.event), 'untrusted workflow event');
  assert.ok(
    ['rust', 'rust-object-import', 'rust-workspace-materialization'].includes(run.head_branch),
    'untrusted workflow branch'
  );
  return artifact;
}
async function boundedBody(response, limit) {
  assert.ok(response.ok, `artifact HTTP ${response.status}`);
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      assert.ok(bytes <= limit, 'artifact response exceeds bounds');
      chunks.push(chunk);
    }
  } catch (error) {
    await response.body?.cancel().catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks);
}
function signedLocation(location) {
  const url = new URL(location);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.username, '');
  assert.equal(url.password, '');
  assert.ok(
    url.hostname.endsWith('.blob.core.windows.net') || url.hostname.endsWith('.actions.githubusercontent.com'),
    'unexpected artifact download host'
  );
  return url.href;
}
async function provisionRelease(target, options = {}) {
  const repository =
    options.repository ||
    process.env.BIT_RUST_OBJECT_IMPORT_RELEASE_REPOSITORY ||
    (process.env.CIRCLE_PROJECT_USERNAME && process.env.CIRCLE_PROJECT_REPONAME
      ? `${process.env.CIRCLE_PROJECT_USERNAME}/${process.env.CIRCLE_PROJECT_REPONAME}`
      : 'teambit/bit');
  assert.ok(repositories.has(repository), 'untrusted release repository');
  const revision = options.revision || command(['git', 'rev-parse', 'HEAD']);
  const name = artifactName(target, revision);
  const token =
    options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GH_RELEASE_GITHUB_API_TOKEN;
  assert.ok(token, 'trusted artifact provisioning requires a GitHub Actions read token');
  const fetcher = options.fetch || fetch;
  const api = async (suffix, redirect = 'error') =>
    fetcher(`https://api.github.com/repos/${repository}/${suffix}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect,
      signal: AbortSignal.timeout(120000),
    });
  const listing = JSON.parse(
    await boundedBody(await api(`actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`), 2 * 1024 * 1024)
  );
  assert.ok(Array.isArray(listing.artifacts) && listing.total_count <= 100, 'ambiguous artifact listing');
  let artifact;
  for (const candidate of listing.artifacts) {
    if (candidate.expired || candidate.workflow_run?.head_sha !== revision) continue;
    assert.ok(Number.isSafeInteger(candidate.workflow_run.id) && candidate.workflow_run.id > 0);
    const run = JSON.parse(await boundedBody(await api(`actions/runs/${candidate.workflow_run.id}`), 2 * 1024 * 1024));
    try {
      trustedArtifact(candidate, run, repository, revision, name);
    } catch {
      continue;
    }
    if (!artifact || candidate.id > artifact.id) artifact = candidate;
  }
  assert.ok(artifact, 'no successful trusted artifact for release revision and target');
  const redirect = await api(`actions/artifacts/${artifact.id}/zip`, 'manual');
  assert.equal(redirect.status, 302, 'artifact download must use a signed redirect');
  const url = signedLocation(redirect.headers.get('location'));
  const zip = await boundedBody(
    await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(120000) }),
    MAX_ZIP
  );
  assert.equal(zip.length, artifact.size_in_bytes, 'artifact archive size changed');
  assert.equal(`sha256:${sha256(zip)}`, artifact.digest, 'artifact digest mismatch');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-trusted-artifact-'));
  try {
    const zipPath = path.join(directory, 'ci.zip');
    fs.writeFileSync(zipPath, zip, { flag: 'wx', mode: 0o600 });
    execFileSync(
      process.env.PYTHON || 'python3',
      [path.join(__dirname, 'extract-ci-zip.py'), zipPath, directory, target, revision],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    fs.unlinkSync(zipPath);
    const archive = path.join(directory, `bit-object-import-0.1.0-${target}-${revision.slice(0, 12)}.tar.gz`);
    const { manifest } = verifiedArchive(archive);
    assert.equal(manifest.target, target);
    assert.equal(manifest.gitRevision, revision);
    assert.equal(
      manifest.objectImportSourceSha256,
      sourceIdentity(),
      'release checkout does not match trusted native sources'
    );
    return directory;
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
module.exports = { provisionRelease, artifactName, trustedArtifact, signedLocation, boundedBody };
