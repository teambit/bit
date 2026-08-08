import fs from 'fs';
import { expect } from 'chai';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('installing with non-default nodeLinker', function () {
  let helper: Helper;
  this.timeout(0);
  before(async () => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('using pnpm as a package manager', () => {
    describe(`setting nodeLinker to "hoisted"`, () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('nodeLinker', 'hoisted');
        helper.command.install('is-positive');
      });
      it('should create a hoisted node_modules', function () {
        const depPath = path.join(helper.fixtures.scopes.localPath, 'node_modules/is-positive');
        expect(fs.realpathSync(depPath)).to.eq(depPath);
      });
    });
    describe(`setting nodeLinker to "isolated"`, () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('nodeLinker', 'isolated');
        helper.command.install('is-positive');
      });
      it('should create a hoisted node_modules', function () {
        const depPath = path.join(helper.fixtures.scopes.localPath, 'node_modules/is-positive');
        // the isolated linker symlinks into a virtual store: `node_modules/.pnpm` project-locally,
        // or pnpm's shared `<storeDir>/links` root when the global virtual store is enabled.
        expect(fs.realpathSync(depPath)).to.match(/[\\/](\.pnpm|links)[\\/]/);
      });
    });
  });
  // skipped: yarn support is deprecated and planned for removal
  describe.skip('using Yarn as a package manager', () => {
    describe(`setting nodeLinker to "hoisted"`, () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/yarn`);
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('nodeLinker', 'hoisted');
        helper.command.install('is-positive');
      });
      it('should create a hoisted node_modules', function () {
        const depPath = path.join(helper.fixtures.scopes.localPath, 'node_modules/is-positive');
        expect(fs.realpathSync(depPath)).to.eq(depPath);
      });
    });
    describe.skip(`setting nodeLinker to "isolated"`, () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/yarn`);
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('nodeLinker', 'isolated');
        helper.command.install('is-positive');
      });
      it('should create node_modules', function () {
        const depPath = path.join(helper.fixtures.scopes.localPath, 'node_modules/is-positive');
        expect(fs.realpathSync(depPath)).to.contain('.store');
      });
    });
  });
});
