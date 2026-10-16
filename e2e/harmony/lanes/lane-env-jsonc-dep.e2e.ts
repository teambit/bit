import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { Extensions } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

/**
 * Bug reproduction: env.jsonc peer dependency that is also a workspace component
 * oscillates between snap and tag versions on a lane.
 *
 * Scenario:
 * 1. An env has a peer dependency in env.jsonc pointing to a workspace component (comp1)
 * 2. comp1 is tagged on main (e.g., 0.0.1) and the env.jsonc has that tag version
 * 3. On a lane, comp1 gets snapped (hash-based version)
 * 4. The env's dep for comp1 should consistently resolve to the snap version from the workspace
 * 5. BUG: after snapping on the lane, `bit diff` shows the env as modified,
 *    with the dep version flipping between the snap hash and the tag from env.jsonc.
 *    This flip-flops back and forth on subsequent snaps.
 */
describe('env with workspace component as peer dep in env.jsonc on lane', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('snap on a lane with env-own dep that is also in the workspace', () => {
    let envName: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();

      // Create comp1 - a regular component that will also be referenced as env peer dep
      helper.fs.outputFile('comp1/index.ts', 'export const comp1 = "v1";');
      helper.command.addComponent('comp1');

      // Create an env manually
      envName = 'my-env';
      helper.fs.outputFile(
        `${envName}/${envName}.bit-env.ts`,
        `export class MyEnv {}
export default new MyEnv();
`
      );
      helper.fs.outputFile(`${envName}/index.ts`, `export { MyEnv } from './${envName}.bit-env';`);
      helper.command.addComponent(envName);
      helper.extensions.addExtensionToVariant(envName, 'teambit.envs/env');

      // Create comp2 that uses the env
      helper.fs.outputFile('comp2/index.ts', 'export const comp2 = "v1";');
      helper.command.addComponent('comp2');
      helper.command.setEnv('comp2', envName);

      // Tag all on main so comp1 gets version 0.0.1
      helper.command.tagAllWithoutBuild();

      // Now add env.jsonc with comp1@0.0.1 as peer dep (comp1 is now tagged at 0.0.1)
      const comp1PkgName = helper.general.getPackageNameByCompName('comp1', false);
      helper.fixtures.generateEnvJsoncFile(envName, {
        policy: {
          peers: [
            {
              name: comp1PkgName,
              version: '0.0.1',
              supportedRange: '^0.0.1',
            },
          ],
        },
      });

      // Tag again so the env picks up the env.jsonc with comp1 peer dep
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      // Create a lane and modify comp1
      helper.command.createLane('dev');
      helper.fs.outputFile('comp1/index.ts', 'export const comp1 = "v2";');
      // First snap on lane - comp1 gets a snap hash
      helper.command.snapAllComponentsWithoutBuild();
    });

    // BUG: after snapping on the lane, the env shows as modified because the env-own dep
    // for comp1 resolves to 0.0.1 (from env.jsonc) instead of the snap hash (from workspace).
    // The env should NOT be modified - its dep for comp1 should use the workspace snap version.
    it('should not show the env as modified after snapping on lane', () => {
      const status = helper.command.statusJson();
      const modifiedNames = status.modifiedComponents.map((c: any) => (typeof c === 'string' ? c : c.id));
      expect(modifiedNames).to.not.include(`${helper.scopes.remote}/${envName}`);
    });

    it('bit diff should not show dependency version changes between snap and tag for the env', () => {
      const diff = helper.command.diff(envName);
      // Should not show deps changing from snap hash to tag 0.0.1
      expect(diff).to.not.have.string('0.0.1');
    });

    describe('after a second snap on the lane', () => {
      before(() => {
        helper.fs.outputFile('comp1/index.ts', 'export const comp1 = "v3";');
        helper.command.snapAllComponentsWithoutBuild();
      });

      it('should not show the env as modified', () => {
        const status = helper.command.statusJson();
        const modifiedNames = status.modifiedComponents.map((c: any) => (typeof c === 'string' ? c : c.id));
        expect(modifiedNames).to.not.include(`${helper.scopes.remote}/${envName}`);
      });

      it('bit diff should not show dependency version changes for the env', () => {
        const diff = helper.command.diff(envName);
        expect(diff).to.not.have.string('0.0.1');
      });
    });

    describe('after a third snap on the lane (verifying no flip-flop)', () => {
      before(() => {
        helper.fs.outputFile('comp1/index.ts', 'export const comp1 = "v4";');
        helper.command.snapAllComponentsWithoutBuild();
      });

      it('should not show the env as modified', () => {
        const status = helper.command.statusJson();
        const modifiedNames = status.modifiedComponents.map((c: any) => (typeof c === 'string' ? c : c.id));
        expect(modifiedNames).to.not.include(`${helper.scopes.remote}/${envName}`);
      });

      it('bit diff should not show dependency version changes for the env', () => {
        const diff = helper.command.diff(envName);
        expect(diff).to.not.have.string('0.0.1');
      });
    });
  });

  /**
   * an env.jsonc peer that is a component and is part of the lane, set with a "+" placeholder.
   * on the lane, it should follow the lane snap. once the lane is merged and released (tagged from a bare scope,
   * the way bit.cloud releases a change-request), it should follow the new tag, with the "^" prefix.
   * it also covers a bug where releasing from a bare scope dropped the component peer-dependencies from the
   * dependency-resolver data, so on main they appeared only in the policy and every new lane showed them as new.
   */
  describe('env.jsonc peer with "+^" that is a lane component, merged and released from a bare scope', () => {
    let comp2PkgName: string;
    let comp2LaneSnap: string;
    let comp1DepsOnLane: Record<string, any>[];
    const getComp2DepData = (deps: Record<string, any>[]) => deps.find((d) => d.packageName === comp2PkgName);
    before(async () => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2); // comp1 requires comp2
      helper.env.setEmptyEnv();
      helper.command.setEnv('comp1', 'empty-env');
      helper.command.tagAllWithoutBuild();
      comp2PkgName = helper.general.getPackageNameByCompName('comp2', false);
      helper.fixtures.generateEnvJsoncFile('empty-env', {
        policy: { peers: [{ name: comp2PkgName, version: '+', supportedRange: '+^' }] },
      });
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane('dev');
      helper.fs.appendFile('comp2/index.js', '\n// v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      comp2LaneSnap = helper.command.getHeadOfLane('dev', 'comp2');
      comp1DepsOnLane = helper.command.showDependenciesData('comp1');

      // merge the lane into main, then release it the way bit.cloud does: tag from a bare scope.
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('dev', '-x');
      helper.command.export();
      const bareScope = helper.scopeHelper.getNewBareScope('-bare-release');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareScope.scopePath);
      await helper.snapping.snapFromScope(
        bareScope.scopePath,
        ['comp1', 'comp2', 'empty-env'].map((name) => ({
          componentId: `${helper.scopes.remote}/${name}`,
          message: 'release',
        })),
        { tag: true, push: true, skipLoadingAspects: true }
      );
    });
    it('on the lane, the peer should be the lane snap and keep the "+^" as the range', () => {
      expect(getComp2DepData(comp1DepsOnLane)).to.include({
        lifecycle: 'peer',
        version: comp2LaneSnap,
        versionRange: '+^',
      });
    });
    describe('after the release', () => {
      // comp2 was tagged once (0.0.1) before the lane, so the release tags it as 0.0.2
      const comp2ReleasedVersion = '0.0.2';
      it('should keep the component peer in the dependency-resolver data, pointing to the new tag', () => {
        const depsResolverData = helper.command.getAspectsDataFromId(
          `${helper.scopes.remote}/comp1`,
          Extensions.dependencyResolver,
          helper.scopes.remotePath
        );
        expect(getComp2DepData(depsResolverData.dependencies), 'the peer was dropped').to.include({
          __type: 'component',
          lifecycle: 'peer',
          version: comp2ReleasedVersion,
          versionRange: '+^',
        });
      });
      describe('checking out the released versions in the workspace', () => {
        before(() => {
          helper.command.import();
          helper.command.checkoutHead('--all', '-x');
        });
        it('should not show any component as modified', () => {
          helper.command.expectStatusToBeClean();
        });
        it('should write the peer with "^" and the new tag into the package.json of the capsule', () => {
          helper.command.build('comp1');
          const comp1Capsule = helper.command
            .capsuleListParsed()
            .capsules.find((capsule: string) => capsule.includes('comp1')) as string;
          const pkgJson = fs.readJsonSync(path.join(comp1Capsule, 'package.json'));
          expect(pkgJson.peerDependencies[comp2PkgName]).to.equal(`^${comp2ReleasedVersion}`);
        });
      });
    });
  });
});
