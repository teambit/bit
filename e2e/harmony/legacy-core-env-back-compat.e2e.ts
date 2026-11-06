import path from 'path';
import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

const LEGACY_SCOPE = 'my-org.legacy';
const LEGACY_COMP = `${LEGACY_SCOPE}/comp1`;
// former core env (teambit.harmony/node), saved WITHOUT a version - see legacy-core-envs.ts.
const LEGACY_ENV_ID = 'teambit.harmony/node';

function envEntryFromModel(versionObj: any) {
  return versionObj.extensions.find((ext: any) => ext.name === 'teambit.envs/envs');
}

/**
 * backward-compat for components tagged when react/node/aspect/mdx/etc. were core (bundled)
 * aspects. those components store their env id WITHOUT a version (e.g. "teambit.harmony/node").
 * bit resolves such versionless ids to the pinned versions in
 * scopes/envs/envs/legacy-core-envs.ts and loads the env as a regular external package.
 *
 * the fixture scope was exported by an old bit (2.0.2), where teambit.harmony/node was still a
 * core env, so comp1@0.0.1 has its env saved versionless - exactly like a real pre-removal
 * component. see the comment at the bottom of this file to regenerate the fixture.
 */
describe('backward compatibility for former core envs', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    const legacyRemote = path.join(helper.scopes.e2eDir, 'legacy-core-env-remote');
    helper.fixtures.extractCompressedFixture('scopes/legacy-core-env-node.tgz', legacyRemote);
    helper.scopeHelper.addRemoteScope(legacyRemote);
    helper.command.runCmd(`bit import ${LEGACY_COMP}`);
    // installs the pinned former-core env (@teambit/node) from the registry and loads it.
    helper.command.install();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('the imported component has its env saved versionless (as it was a core env)', () => {
    const envEntry = envEntryFromModel(helper.command.catComponent(`${LEGACY_COMP}@0.0.1`));
    expect(envEntry.config.env).to.equal(LEGACY_ENV_ID);
    expect(envEntry.data.id).to.equal(LEGACY_ENV_ID);
  });
  it('should not be shown as modified after upgrading to the version that removed the core env', () => {
    const status = helper.command.statusJson();
    expect(status.modifiedComponents).to.have.lengthOf(0);
    helper.command.expectStatusToBeClean();
  });
  describe('re-tagging the component with the new bit', () => {
    before(() => {
      helper.command.tagIncludeUnmodifiedWithoutBuild();
    });
    it('should keep the env reference versionless, so not-yet-upgraded consumers still resolve it', () => {
      // re-tagging must NOT pin the env to its resolved version. otherwise a teammate who has not
      // upgraded yet would import an env-id their (still core) bit has no component for.
      const envEntry = envEntryFromModel(helper.command.catComponent(`${LEGACY_COMP}@latest`));
      expect(envEntry.config.env).to.equal(LEGACY_ENV_ID);
      expect(envEntry.data.id).to.equal(LEGACY_ENV_ID);
    });
  });
});

/**
 * to regenerate scopes/legacy-core-env-node.tgz (e.g. if the model format changes), use a bit
 * version from BEFORE the core-env removal (where teambit.harmony/node is still a core aspect) so
 * the env gets saved versionless:
 *   mkdir remote && cd remote && <old-bit> init --bare my-org.legacy && cd ..
 *   mkdir ws && cd ws && <old-bit> init --default-scope my-org.legacy
 *   mkdir comp1 && echo "export function comp1() { return 'hello'; }" > comp1/index.ts
 *   <old-bit> add comp1 --id comp1 && <old-bit> env set comp1 teambit.harmony/node
 *   <old-bit> install && <old-bit> tag -m "first tag"
 *   <old-bit> remote add file://$PWD/../remote && <old-bit> export
 *   cd ../remote && tar -czf legacy-core-env-node.tgz scope.json objects index.json
 *   # copy the tgz to components/legacy/e2e-helper/excluded-fixtures/scopes/
 */
