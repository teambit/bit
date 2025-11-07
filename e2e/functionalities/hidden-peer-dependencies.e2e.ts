import path from 'path';
import { expect } from 'chai';
import fs from 'fs-extra';
import { Helper } from '@teambit/legacy.e2e-helper';
import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';

describe.only('hidden peer dependency via env.jsonc', function () {
  this.timeout(0);
  let helper: Helper;
  let workspaceCapsulesRootDir: string;
  const peerPkgName = 'is-odd';

  before(() => {
    helper = new Helper();
    helper.scopeHelper.reInitWorkspace();
    // create a single component comp1
    helper.fixtures.populateComponents(1);
    // ensure comp1 actually requires is-odd so it's considered a used peer
    helper.fs.appendFile('comp1/index.js', 'const isOdd = require("is-odd");');
    // create env with hidden is-odd peer
    helper.env.setCustomNewEnv(
      undefined,
      undefined,
      {
        policy: {
          peers: [
            {
              name: peerPkgName,
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
    // apply env to comp1
    helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-env/env1`, {});
    helper.extensions.addExtensionToVariant('custom-env', 'teambit.envs/env', {});
    helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
    helper.command.install('--add-missing-deps');
    helper.command.build('--skip-tests');
    workspaceCapsulesRootDir = helper.command.capsuleListParsed().workspaceCapsulesRootDir;
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  it('should have is-odd/package.json present in the workspace root node_modules', () => {
    const isOddPkgJsonPath = resolveFrom(helper.fixtures.scopes.localPath, ['is-odd/package.json']);
    expect(fs.existsSync(isOddPkgJsonPath)).to.be.true;
  });

  it('should exclude is-odd from capsule package.json peerDependencies', () => {
    const pkgJsonPath = path.join(workspaceCapsulesRootDir, `${helper.scopes.remote}_comp1/package.json`);
    const pkgJson = fs.readJsonSync(pkgJsonPath);
    const peerDeps = pkgJson.peerDependencies || {};
    expect(peerDeps[peerPkgName]).to.be.undefined;
  });
});
