import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('pnpm with hoisted node linker, when there is a dependency that has the same name as a workspace component', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.extensions.bitJsonc.addKeyValToDependencyResolver('rootComponents', true);
    helper.extensions.bitJsonc.addKeyValToDependencyResolver('nodeLinker', 'hoisted');
    helper.fixtures.populateComponents(1);
    helper.extensions.addExtensionToVariant('comp1', 'teambit.pkg/pkg', {
      packageJson: {
        name: 'once',
      },
    });
    helper.bitJsonc.addKeyValToDependencyResolver('policy', {
      dependencies: {
        'map-limit': '0.0.1', // this dependency has "once" in dependencies
      },
    });
    helper.command.install();
  });
  it('should not override the linked local component with a dependency from the registry', () => {
    // The "once" from the registry doesn't have a dist directory
    expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/once/dist')).to.be.a.path();
  });
  it('should nest the dependency from the registry into the dependent package\'s node_modules', () => {
    expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/map-limit/node_modules/once/package.json')).to.be.a.path();
  });
});

