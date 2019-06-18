import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

describe('capsule', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('new components with dependencies (untagged)', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFoo);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('tagged components with dependencies (before export)', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.tagAllComponents();
      helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFoo);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('exported components with dependencies', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFoo);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('imported components with dependencies', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFoo);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('build into capsule', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.importDummyCompiler('capsule');
      helper.build();
    });
    it('should be able to require the component and its dependencies from the dist directory', () => {
      const appJsFixture = "const barFoo = require('./dist/bar/foo'); console.log(barFoo());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
  describe('test in capsule', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.populateWorkspaceWithComponents();
      helper.importDummyTester('capsule');

      helper.installNpmPackage('chai', '4.1.2');
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.createFile('utils', 'is-type.spec.js', fixtures.isTypeSpec(true));
      helper.addComponent('utils/is-type.js -t utils/is-type.spec.js', { i: 'utils/is-type' });
    });
    it('should be able to require the component and its dependencies from the dist directory', () => {
      const output = helper.testComponent();
      expect(output).to.have.string('tests passed');
    });
  });
});
