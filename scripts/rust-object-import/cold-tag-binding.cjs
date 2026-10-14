const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { verifyCli } = require('./cold-command-binding.cjs');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const { localRuntimeDependencies } = require('./merge-transaction-qualification.cjs');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function bindTag(cli, helper, dimensions, { diagnostic = false, allowUnmarkedCli = false } = {}) {
  const repository = path.resolve(__dirname, '../..');
  assert.ok(!allowUnmarkedCli || diagnostic, 'unmarked CLI is only valid for non-qualifying diagnostics');
  const cliBinding = await verifyCli(cli, allowUnmarkedCli);
  const addon = process.env.BIT_TEST_WORKSPACE_ADDON;
  assert.ok(addon, 'explicit immutable addon path required');
  const names = await localRuntimeDependencies([
    'cold-tag-qualification.cjs',
    'cold-tag-measure.cjs',
    'cold-tag-binding.cjs',
    'checkout-transition-determinism.cjs',
    'import-trace.cjs',
    'cold-command-wrapper-baseline.cjs',
  ]);
  const bindings = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, digest(await fs.readFile(path.join(__dirname, name)))]))
  );
  const metadata = {
    cliBinding,
    helperSha256: digest(await fs.readFile(helper)),
    addonSha256: digest(await fs.readFile(addon)),
    nativeSourceDigest: sourceIdentity(repository),
    bindings,
    fixtureDimensions: dimensions,
  };
  const manifestPath = path.join(path.dirname(helper), 'manifest.json');
  if (!diagnostic) {
    const bytes = await fs.readFile(manifestPath);
    const manifest = JSON.parse(bytes);
    assert.equal(manifest.binary.sha256, metadata.helperSha256);
    assert.equal(manifest.addon.sha256, metadata.addonSha256);
    assert.equal(manifest.objectImportSourceSha256, metadata.nativeSourceDigest);
    metadata.packageManifestSha256 = digest(bytes);
    metadata.packageGitRevision = manifest.gitRevision;
  }
  async function verify() {
    if (!diagnostic) assert.equal(digest(await fs.readFile(manifestPath)), metadata.packageManifestSha256);

    assert.deepEqual(await verifyCli(cli, allowUnmarkedCli), cliBinding);
    assert.equal(digest(await fs.readFile(helper)), metadata.helperSha256);
    assert.equal(digest(await fs.readFile(addon)), metadata.addonSha256);
    for (const [name, expected] of Object.entries(bindings))
      assert.equal(digest(await fs.readFile(path.join(__dirname, name))), expected, name);
    if (!diagnostic) {
      assert.equal(sourceIdentity(repository), metadata.nativeSourceDigest);
      for (const [name, expected] of Object.entries(cliBinding.marker.sourceSha256))
        assert.equal(digest(await fs.readFile(path.join(repository, name))), expected, name);
    }
  }
  await verify();
  return { metadata, verify };
}

async function verifyArtifacts(report) {
  for (const run of report.runs)
    for (const stage of run.stages) {
      assert.equal(digest(await fs.readFile(stage.artifact)), stage.sha256);
      const raw = JSON.parse(await fs.readFile(stage.artifact));
      assert.equal(digest(JSON.stringify(raw.result)), stage.outputSha256);
    }
}

module.exports = { bindTag, verifyArtifacts, digest };
