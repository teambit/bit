import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../../../src/e2e-helper/e2e-helper';

describe('policies order', function () {
  let helper: Helper;
  this.timeout(0);
  describe('deps set order', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.create('react-env', 'custom-react/env1', '-p custom-react/env1');
      helper.fixtures.populateEnvMainRuntime(`custom-react/env1/env1.main.runtime.ts`, {
        envName: 'env1',
        dependencies: {
          peers: [
            {
              name: 'is-positive',
              supportedRange: '^3.0.0',
              version: '3.0.0',
            },
          ],
        },
      });
      helper.extensions.addExtensionToVariant('custom-react', 'teambit.envs/env', {});
      helper.bitJsonc.addKeyValToDependencyResolver('policy', {
        dependencies: {
          'is-positive': '1.0.0',
        },
      });
      helper.command.dependenciesSet('custom-react/env1', 'is-positive@2.0.0');
      helper.command.install();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install is-positive specified by the deps set', () => {
      expect(
        fs.readJsonSync(
          resolveFrom(path.join(helper.fixtures.scopes.localPath, 'custom-react/env1'), ['is-positive/package.json'])
        ).version
      ).to.eq('2.0.0');
    });
  });
  describe('env own dependency', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.create('react-env', 'custom-react/env1', '-p custom-react/env1');
      helper.fixtures.populateEnvMainRuntime(`custom-react/env1/env1.main.runtime.ts`, {
        envName: 'env1',
        dependencies: {
          peers: [
            {
              name: 'react',
              supportedRange: '^16.0.0',
              version: '16.0.0',
            },
          ],
        },
      });
      helper.extensions.addExtensionToVariant('custom-react', 'teambit.envs/env', {});
      helper.command.install();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('should install react specified in env itself', () => {
      helper.command.showComponent('custom-react/env1'); // We need to run bit show twice due to a bug in bit
      const showOutput = helper.command.showComponent('custom-react/env1');
      expect(showOutput).to.have.string('react@16.0.0');
    });
  });
});
