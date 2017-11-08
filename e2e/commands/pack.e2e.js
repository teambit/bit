import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import path from 'path';
import fs from 'fs-extra';
import tar from 'tar';

const assert = chai.assert;
chai.use(require('chai-fs'));

describe('bit pack', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  before(() => {
    helper.setNewLocalAndRemoteScopes();
    helper.importCompiler('bit.envs/compilers/react-css');
    helper.copyFixtureComponents();
    helper.addComponentWithOptions('hero-button', { i: 'test/hero-button' });
    helper.addComponentWithOptions('styles', { i: 'test/styles' });
    helper.runCmd('npm i prop-types ');
    helper.commitAllComponents();
    helper.exportAllComponents();
    helper.reInitLocalScope();
    helper.addRemoteScope();
    helper.runCmd('npm i prop-types');
    helper.copyFixtureComponents();
    helper.importComponent('test/styles');
    helper.importComponent('test/hero-button');
    helper.addComponentWithOptions('hero', { i: 'test/hero' });
    helper.commitAllComponents();
    helper.exportAllComponents();
  });
  describe('test pack', () => {
    it('should print the tgz path', () => {
      const output = helper.runCmd(
        `bit pack ${helper.remoteScope}/test/hero  -d ${helper.localScopePath}   -l -w -o `,
        helper.remoteScopePath
      );
      tar.x({
        file: `${helper.localScopePath}/${helper.remoteScope}.test.hero-0.0.1.tgz`,
        sync: true,
        cwd: helper.localScopePath
      });
      expect(output).to.have.string(`${helper.remoteScope}.test.hero-0.0.1.tgz`);
    });
    it('check package.json post install script', () => {
      const pjson = helper.readPackageJson(path.join(helper.localScopePath, 'package'));
      expect(pjson).to.have.property('scripts');
      const scripts = pjson.scripts;
      expect(scripts).to.have.property('postinstall');
      const postInstallScript = scripts.postinstall;
      expect(postInstallScript).to.equal('node bitBindings.js');
    });
    it('check package.json bit dependencies', () => {
      const pjson = helper.readPackageJson(path.join(helper.localScopePath, 'package'));
      const dependencies = pjson.dependencies;
      expect(Object.keys(dependencies)).to.have.lengthOf(2);
      expect(dependencies).to.have.property(`${helper.remoteScope}.test.hero-button`);
      expect(dependencies).to.have.property(`${helper.remoteScope}.test.styles`);
    });
    it('check post install bindings', () => {
      const packDir = path.join(helper.localScopePath, 'package');
      const node_modules_dir = path.join(packDir, 'node_modules', 'bit', 'test');
      helper.runCmd('node bitBindings.js ', packDir);
      assert.pathExists(node_modules_dir);
      assert.pathExists(path.join(node_modules_dir, 'hero-button'));
      assert.pathExists(path.join(node_modules_dir, 'styles'));
      expect(path.join(node_modules_dir, 'hero-button', 'index.js'))
        .to.be.a.file()
        .with.content(`module.exports = require('${helper.remoteScope}.test.hero-button');`);
      expect(path.join(node_modules_dir, 'styles', 'index.css'))
        .to.be.a.file()
        .with.content(`@import '~${helper.remoteScope}.test.styles/index.css';`);
    });
  });
});
