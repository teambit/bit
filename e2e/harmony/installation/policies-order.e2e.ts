import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../../../src/e2e-helper/e2e-helper';

describe('default peer dependency of the env declared by the env has higher priority than the same dependency from other sources', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.bitJsonc.setupDefault();
    helper.command.create('react-env', 'custom-react/env1', '-p custom-react/env1');
    helper.fs.envMainRuntimeFile(`custom-react/env1/env1.main.runtime.ts`, {
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
