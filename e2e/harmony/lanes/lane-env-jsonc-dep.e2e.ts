import { expect } from 'chai';
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
});
