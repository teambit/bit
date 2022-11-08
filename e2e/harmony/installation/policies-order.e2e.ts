import { resolveFrom } from '@teambit/toolbox.modules.module-resolver';
import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { sync as resolveSync } from 'resolve';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

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
            name: 'react',
            supportedRange: '^16.8.0',
            version: '16.13.1',
          },
        ],
      },
    });
    helper.fixtures.populateComponents(1);
    helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
    helper.fs.outputFile(
      `comp2/index.js`,
      `const React = require("react");const comp1 = require("@${helper.scopes.remote}/comp1");`
    );
    helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-react/env1`, {});
    helper.extensions.addExtensionToVariant('custom-react', 'teambit.envs/env', {});
    helper.bitJsonc.addKeyValToDependencyResolver('policy', {
      dependencies: {
        react: '17',
      },
    });
    helper.command.dependenciesSet('custom-react/env1', 'react@18.0.0');
    helper.command.dependenciesSet('comp1', 'react@17.0.0');
    helper.command.install();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should install react specified by the env itself to the node_modules of the env', () => {
    expect(
      fs.readJsonSync(
        resolveFrom(path.join(helper.fixtures.scopes.localPath, 'custom-react/env1'), ['react/package.json'])
      ).version
    ).to.eq('16.13.1');
  });
  it('should install react specified by configuration of the component to the component', () => {
    expect(
      fs.readJsonSync(resolveFrom(path.join(helper.fixtures.scopes.localPath, 'comp1'), ['react/package.json'])).version
    ).to.eq('17.0.0');
  });
});
