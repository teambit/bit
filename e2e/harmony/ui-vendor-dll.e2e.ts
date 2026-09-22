import { expect } from 'chai';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { IS_WINDOWS } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';
import { uiE2eMode } from '../http-helper';

/**
 * `teambit.ui-foundation/ui` is a core aspect bit dogfoods from its own source (this repo IS its
 * workspace, tracked in this repo's own `.bitmap`) - it is not trackable as a component inside a
 * fixture workspace the way `helper.fixtures.populateComponents` produces. So, unlike most e2e
 * suites, this one builds against the real repo checkout rather than a throwaway workspace.
 * this file lives at <repo>/e2e/harmony.
 *
 * Skipped unless `BIT_E2E_UI_MODE` is set, same gate as `ui-start.e2e.ts`/`ui-ssr.e2e.ts` (see
 * `uiE2eMode` in `../http-helper.ts`): `--tasks BundleUI` really invokes rspack to build the vendor
 * DLL, which needs the UI toolchain the default esbuild-bundle distribution doesn't ship (the
 * `--ui-bundling` externals group, bundle-plan §8.3/§10) - left ungated this fails under
 * `e2e_test_esbuild_bundle`'s unguarded sweep with "Cannot find module 'assert/'" instead of
 * skipping. Run locally with `BIT_E2E_UI_MODE=rebuild npx mocha --require ./babel-register
 * e2e/harmony/ui-vendor-dll.e2e.ts`.
 */
const repoRoot = resolve(__dirname, '../..');
const mode = uiE2eMode();

(IS_WINDOWS || !mode ? describe.skip : describe)('ui vendor dll', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });
  after(() => helper.scopeHelper.destroy());

  it('produces a ui-vendor-dll artifact alongside the existing ui-bundle pre-bundle', () => {
    helper.command.runCmd('bit build teambit.ui-foundation/ui --tasks BundleUI', repoRoot);
    const capsuleOutput = helper.command.runCmd('bit capsule list --json', repoRoot);
    const capsules = JSON.parse(capsuleOutput).capsules as string[];
    // several capsules match a loose "ui-foundation" substring (e.g. `teambit.ui-foundation_panels`)
    // - only the exact `teambit.ui-foundation_ui@<version>` basename is the one BundleUiTask wrote to.
    const uiCapsule = capsules.find((c: string) => (c.split('/').pop() || '').startsWith('teambit.ui-foundation_ui@'));
    expect(uiCapsule).to.not.be.undefined;

    const artifactDir = join(uiCapsule as string, 'artifacts', 'ui-bundle');
    expect(existsSync(join(artifactDir, '.hash'))).to.equal(true); // existing pre-bundle, untouched
    expect(existsSync(join(artifactDir, 'ui-vendor-dll', 'vendor-manifest.json'))).to.equal(true);
    expect(existsSync(join(artifactDir, 'ui-vendor-dll', 'vendor.js'))).to.equal(true);

    const manifest = JSON.parse(readFileSync(join(artifactDir, 'ui-vendor-dll', 'vendor-manifest.json'), 'utf-8'));
    expect(Object.keys(manifest.content).some((k: string) => k.includes('react'))).to.equal(true);
  });
});
