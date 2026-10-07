import path from 'path';
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import chaiString from 'chai-string';
import { Helper } from '@teambit/legacy.e2e-helper';
import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';

chai.use(chaiString);

describe('peer-dependencies functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  // the rest of the peer-dependencies flows are unit tests: scopes/component/status/peer-dependencies.spec.ts and
  // scopes/component/snapping/peer-component-dependency.spec.ts. this one needs a real env component and a real install.
  describe('a component is a peer dependency with a hidden peer in its env', () => {
    let workspaceCapsulesRootDir: string;
    const hiddenPeerPackageName = 'is-odd';
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(2);
      helper.fs.appendFile('comp1/index.js', `const isOdd = require("${hiddenPeerPackageName}");`);
      helper.env.setCustomNewEnv(
        undefined,
        undefined,
        {
          policy: {
            peers: [
              {
                name: hiddenPeerPackageName,
                version: '1.0.0',
                supportedRange: '*',
                hidden: true,
              },
            ],
          },
        },
        false,
        'custom-env/env1',
        'custom-env/env1'
      );
      helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-env/env1`, {});
      helper.extensions.addExtensionToVariant('custom-env', 'teambit.envs/env', {});
      helper.workspaceJsonc.addPolicyToDependencyResolver({
        peerDependencies: { [`@${helper.scopes.remote}/comp2`]: '*' },
      });
      helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
      helper.command.install('--add-missing-deps');
      helper.command.build(undefined, '--ignore-issues="DuplicateComponentAndPackage"');
      workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
    });
    it('installs a hidden peer in the workspace but excludes it from the capsule manifest', () => {
      const hiddenPeerPackageJson = resolveFrom(helper.fixtures.scopes.localPath, [
        `${hiddenPeerPackageName}/package.json`,
      ]);
      expect(fs.existsSync(hiddenPeerPackageJson)).to.be.true;
      const capsulePackageJson = fs.readJsonSync(
        path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1/package.json`)
      );
      expect(capsulePackageJson.peerDependencies).to.not.have.property(hiddenPeerPackageName);
    });
  });
});
