import fs from 'fs';
import { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

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
        helper.scopeHelper.reInitLocalScope();
        helper.extensions.bitJsonc.addKeyValToDependencyResolver('nodeLinker', 'hoisted');
        helper.command.install('is-positive');
      });
      it('should create a hoisted node_modules', function () {
        const depPath = path.join(helper.fixtures.scopes.localPath, 'node_modules/is-positive');
        expect(fs.realpathSync(depPath)).to.eq(depPath);
      });
    });
    describe(`setting nodeLinker to "isolated"`, () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.extensions.bitJsonc.addKeyValToDependencyResolver('nodeLinker', 'isolated');
        helper.command.install('is-positive');
      });
      it('should create a hoisted node_modules', function () {
        const depPath = path.join(helper.fixtures.scopes.localPath, 'node_modules/is-positive');
        expect(fs.realpathSync(depPath)).to.contain('.pnpm');
      });
    });
  });
  describe('using Yarn as a package manager', () => {
    describe(`setting nodeLinker to "hoisted"`, () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/yarn`);
        helper.extensions.bitJsonc.addKeyValToDependencyResolver('nodeLinker', 'hoisted');
        helper.command.install('is-positive');
      });
      it('should create a hoisted node_modules', function () {
        const depPath = path.join(helper.fixtures.scopes.localPath, 'node_modules/is-positive');
        expect(fs.realpathSync(depPath)).to.eq(depPath);
      });
    });
    describe(`setting nodeLinker to "isolated"`, () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.extensions.bitJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/yarn`);
        helper.extensions.bitJsonc.addKeyValToDependencyResolver('nodeLinker', 'isolated');
        helper.command.install('is-positive');
      });
      it('should create a hoisted node_modules', function () {
        const depPath = path.join(helper.fixtures.scopes.localPath, 'node_modules/is-positive');
        expect(fs.realpathSync(depPath)).to.contain('.store');
      });
    });
  });
});
