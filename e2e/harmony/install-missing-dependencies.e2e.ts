import chai, { expect } from 'chai';
import rimraf from 'rimraf';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('install missing dependencies', function () {
  let helper: Helper;
  this.timeout(0);
  before(async () => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.fixtures.createComponentBarFoo(
      'const isPositive = require("is-positive");const compiler = require("@teambit/compiler")'
    );
    helper.fixtures.addComponentBarFoo();
    helper.command.install('--add-missing-deps');
    helper.command.tagAllWithoutBuild();
    helper.command.export();

    helper.scopeHelper.reInitWorkspace();
    helper.scopeHelper.addRemoteScope();
    helper.command.importComponent('bar/foo');
    helper.fixtures.populateComponents(2);
    helper.fs.outputFile(`comp1/index.js`, `const isOdd = require("is-odd")`);
    helper.fs.outputFile(
      `comp2/index.js`,
      `const comp1 = require("@${helper.scopes.remote}/comp1");const isEven = require("is-even")`
    );
    rimraf.sync(path.join(helper.fixtures.scopes.localPath, 'node_modules'));
    helper.command.install('--add-missing-deps');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should install the missing peer dependencies to node_modules', function () {
    expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/is-odd')).to.be.a.path();
    expect(path.join(helper.fixtures.scopes.localPath, 'node_modules/is-even')).to.be.a.path();
  });
  it('should add the missing peer dependencies to workspace.jsonc', () => {
    expect(
      Object.keys(helper.workspaceJsonc.read()['teambit.dependencies/dependency-resolver'].policy.dependencies)
    ).to.eql(['is-even', 'is-odd']);
  });
});
