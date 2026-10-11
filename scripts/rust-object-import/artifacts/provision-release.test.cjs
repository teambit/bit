const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { trustedArtifact, artifactName, signedLocation, boundedBody } = require('./provision-release.cjs');
const revision = 'a'.repeat(40);
const name = artifactName('x86_64-unknown-linux-gnu', revision);
function fixtures() {
  return {
    artifact: {
      id: 1,
      name,
      expired: false,
      digest: 'sha256:' + 'b'.repeat(64),
      size_in_bytes: 100,
      workflow_run: { id: 2, head_sha: revision, repository_id: 3, head_repository_id: 3 },
    },
    run: {
      id: 2,
      repository: { id: 3, full_name: 'zkochan/bit' },
      head_repository: { full_name: 'zkochan/bit' },
      head_sha: revision,
      path: '.github/workflows/rust-dependency-scanner.yml',
      status: 'completed',
      conclusion: 'success',
      event: 'push',
      head_branch: 'rust-object-import',
    },
  };
}
test('provisioning trusts only successful exact-revision push/dispatch builds in the release repository', () => {
  const { artifact, run } = fixtures();
  assert.equal(trustedArtifact(artifact, run, 'zkochan/bit', revision, name), artifact);
  assert.equal(
    trustedArtifact(artifact, { ...run, head_branch: 'rust-workspace-materialization' }, 'zkochan/bit', revision, name),
    artifact
  );
  for (const patch of [
    { event: 'pull_request' },
    { conclusion: 'failure' },
    { status: 'in_progress' },
    { head_sha: 'c'.repeat(40) },
    { path: '.github/workflows/untrusted.yml' },
    { head_repository: { full_name: 'attacker/bit' } },
    { head_branch: 'untrusted' },
  ])
    assert.throws(() => trustedArtifact(artifact, { ...run, ...patch }, 'zkochan/bit', revision, name));
  for (const patch of [
    { expired: true },
    { name: 'wrong' },
    { digest: null },
    { size_in_bytes: 81 * 1024 * 1024 },
    { workflow_run: { ...artifact.workflow_run, head_repository_id: 4 } },
  ])
    assert.throws(() => trustedArtifact({ ...artifact, ...patch }, run, 'zkochan/bit', revision, name));
});
test('signed redirects restrict HTTPS destinations and receive no GitHub credentials', () => {
  assert.equal(
    signedLocation('https://example.blob.core.windows.net/artifact?sig=x'),
    'https://example.blob.core.windows.net/artifact?sig=x'
  );
  for (const url of [
    'http://example.blob.core.windows.net/x',
    'https://evil.test/x',
    'https://token@example.blob.core.windows.net/x',
    'https://blob.core.windows.net.evil.test/x',
  ])
    assert.throws(() => signedLocation(url));
});
test('target mapping is exact and revision-pinned', () => {
  assert.equal(artifactName('aarch64-apple-darwin', revision), 'object-import-macOS-ARM64-' + revision);
  assert.equal(artifactName('x86_64-pc-windows-msvc', revision), 'object-import-Windows-X64-' + revision);
  assert.equal(artifactName('x86_64-unknown-linux-musl', revision), 'object-import-musl-node-22.22.0-' + revision);
  assert.throws(() => artifactName('unknown', revision));
  assert.throws(() => artifactName('x86_64-apple-darwin', 'latest'));
});
test('downloads reject oversized and unsuccessful responses', async () => {
  assert.deepEqual(await boundedBody(new Response('abc'), 3), Buffer.from('abc'));
  await assert.rejects(boundedBody(new Response('abcd'), 3), /bounds/);
  await assert.rejects(boundedBody(new Response('missing', { status: 404 }), 100), /404/);
});
test('CI ZIP extraction rejects traversal, duplicate members and symlinks before writing', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-ci-zip-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const target = 'x86_64-unknown-linux-gnu';
  const prefix = `bit-object-import-0.1.0-${target}-${revision.slice(0, 12)}.tar.gz`;
  const script = path.join(__dirname, 'extract-ci-zip.py');
  for (const mode of ['valid', 'traversal', 'duplicate', 'symlink']) {
    const zip = path.join(directory, mode + '.zip');
    const output = path.join(directory, mode);
    fs.mkdirSync(output);
    execFileSync(
      process.env.PYTHON || 'python3',
      [
        '-c',
        `import zipfile,sys\np,m,n=sys.argv[1:]\nwith zipfile.ZipFile(p,'w') as z:\n for s in ['', '.sha256', '.manifest.json']:\n  i=zipfile.ZipInfo(('../' if m=='traversal' else '')+n+s)\n  i.external_attr=(0o120777 if m=='symlink' else 0o100600)<<16\n  z.writestr(i,b'abc')\n if m=='duplicate': z.writestr(n,b'abc')`,
        zip,
        mode,
        prefix,
      ],
      { stdio: 'pipe' }
    );
    if (mode === 'valid') {
      execFileSync(process.env.PYTHON || 'python3', [script, zip, output, target, revision]);
      assert.equal(fs.readdirSync(output).length, 3);
    } else {
      assert.throws(() =>
        execFileSync(process.env.PYTHON || 'python3', [script, zip, output, target, revision], { stdio: 'pipe' })
      );
      assert.deepEqual(fs.readdirSync(output), []);
    }
  }
});
test(
  'complete trusted provisioning verifies actual archive and strips credentials at download',
  { skip: !process.env.BIT_TEST_OBJECT_ARTIFACT },
  async (t) => {
    const { provisionRelease } = require('./provision-release.cjs');
    const { verifiedArchive } = require('./smoke.cjs');
    const { sha256 } = require('./contract.cjs');
    const archive = process.env.BIT_TEST_OBJECT_ARTIFACT;
    const { manifest } = verifiedArchive(archive);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-provision-fixture-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const zipPath = path.join(directory, 'artifact.zip');
    execFileSync(process.env.PYTHON || 'python3', [
      '-c',
      "import zipfile,os,sys\nwith zipfile.ZipFile(sys.argv[1],'w') as z:\n for s in ['', '.sha256', '.manifest.json']: z.write(sys.argv[2]+s,os.path.basename(sys.argv[2]+s))",
      zipPath,
      archive,
    ]);
    const zip = fs.readFileSync(zipPath);
    const repo = 'zkochan/bit';
    const sha = manifest.gitRevision;
    const fixture = fixtures();
    fixture.artifact.name = artifactName(manifest.target, sha);
    fixture.artifact.digest = 'sha256:' + sha256(zip);
    fixture.artifact.size_in_bytes = zip.length;
    fixture.artifact.workflow_run.head_sha = sha;
    fixture.run.head_sha = sha;
    const urls = [];
    const fetcher = async (url, options) => {
      urls.push(url);
      if (url.startsWith('https://api.github.com/'))
        assert.equal(options.headers.Authorization, 'Bearer fixture-token');
      else {
        assert.equal(options.headers, undefined, 'GitHub credentials never leave the API origin');
        return new Response(zip);
      }
      if (url.includes('actions/artifacts?')) return Response.json({ total_count: 1, artifacts: [fixture.artifact] });
      if (url.endsWith('actions/runs/2')) return Response.json(fixture.run);
      if (url.endsWith('actions/artifacts/1/zip'))
        return new Response(null, {
          status: 302,
          headers: { location: 'https://fixture.blob.core.windows.net/archive' },
        });
      throw new Error('unexpected API request');
    };
    const output = await provisionRelease(manifest.target, {
      repository: repo,
      revision: sha,
      token: 'fixture-token',
      fetch: fetcher,
    });
    t.after(() => fs.rmSync(output, { recursive: true, force: true }));
    assert.equal(fs.readdirSync(output).length, 3);
    assert.deepEqual(verifiedArchive(path.join(output, path.basename(archive))).manifest, manifest);
    assert.equal(urls.length, 4);
    fixture.artifact.digest = 'sha256:' + '0'.repeat(64);
    await assert.rejects(
      provisionRelease(manifest.target, { repository: repo, revision: sha, token: 'fixture-token', fetch: fetcher }),
      /digest mismatch/
    );
  }
);
