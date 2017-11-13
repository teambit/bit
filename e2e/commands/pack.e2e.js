import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import path from 'path';
import fs from 'fs-extra';
import tar from 'tar';

chai.use(require('chai-fs'));

describe('bit pack with absolute paths', function () {
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
      const output = helper.pack('test/hero', helper.localScopePath);

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
      expect(scripts).to.be.an('object');
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
      expect(node_modules_dir).to.be.a.directory();
      expect(path.join(node_modules_dir, 'hero-button')).to.be.a.directory();
      expect(path.join(node_modules_dir, 'styles')).to.be.a.directory();
      expect(path.join(node_modules_dir, 'hero-button', 'index.js'))
        .to.be.a.file()
        .with.content(`module.exports = require('${helper.remoteScope}.test.hero-button');`);
      expect(path.join(node_modules_dir, 'styles', 'index.css'))
        .to.be.a.file()
        .with.content(`@import '~${helper.remoteScope}.test.styles/index.css';`);
    });
  });
});

describe('bit pack with relative paths', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  before(() => {
    helper.setNewLocalAndRemoteScopes();
    helper.copyFixtureComponents();
    helper.addComponentWithOptions('hero-button', { i: 'test/hero-button' });
    helper.addComponentWithOptions('styles', { i: 'test/styles' });
    helper.addComponentWithOptions('hero-withrelativepaths', { i: 'test/herowithrelativepaths' });
    helper.runCmd('npm i prop-types ');
    helper.commitAllComponents();
    helper.exportAllComponents();
    helper.reInitLocalScope();
    helper.addRemoteScope();
    helper.runCmd('npm i prop-types');
    helper.importComponent('test/herowithrelativepaths');
  });
  describe('test pack ', () => {
    it('should print the tgz path', () => {
      const output = helper.pack('test/herowithrelativepaths', helper.localScopePath);
      tar.x({
        file: `${helper.localScopePath}/${helper.remoteScope}.test.herowithrelativepaths-0.0.1.tgz`,
        sync: true,
        cwd: helper.localScopePath
      });
      expect(output).to.have.string(`${helper.remoteScope}.test.herowithrelativepaths-0.0.1.tgz`);
    });

    it('check package.json bit dependencies', () => {
      const pjson = helper.readPackageJson(path.join(helper.localScopePath, 'package'));
      expect(pjson.scripts).to.be.an('object');
      const dependencies = pjson.dependencies;
      expect(Object.keys(dependencies)).to.have.lengthOf(2);
      expect(dependencies).to.have.property(`${helper.remoteScope}.test.hero-button`);
      expect(dependencies).to.have.property(`${helper.remoteScope}.test.styles`);
    });
    it('check links', () => {
      const packDir = path.join(helper.localScopePath, 'package');
      expect(packDir).to.be.a.directory();
      expect(path.join(packDir, 'hero-button')).to.be.a.directory();
      expect(path.join(packDir, 'styles')).to.be.a.directory();
      expect(path.join(packDir, 'hero-button', 'index.js'))
        .to.be.a.file()
        .with.content(`module.exports = require('${helper.remoteScope}.test.hero-button');`);
      expect(path.join(packDir, 'styles', 'global.css'))
        .to.be.a.file()
        .with.content(`@import '~${helper.remoteScope}.test.styles/index.css';`);
    });
  });
});
