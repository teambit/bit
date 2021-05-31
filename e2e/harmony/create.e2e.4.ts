import chai, { expect } from 'chai';
import path from 'path';
import os from 'os';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('create extension', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when running outside the workspace', () => {
    it('should throw ConsumerNotFound error', () => {
      expect(() => helper.command.runCmd('bit create aspect my-aspect', os.tmpdir())).to.throw('workspace not found');
    });
  });
  describe('with --namespace flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.create('aspect', 'my-aspect', '--namespace ui');
    });
    it('should create the directories properly', () => {
      const compRootDir = path.join(helper.scopes.localPath, helper.scopes.remote, 'ui/my-aspect');
      expect(compRootDir).to.be.a.directory();
      expect(path.join(compRootDir, 'index.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.main.runtime.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.aspect.ts')).to.be.a.file();
    });
    it('should add the component correctly', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('ui/my-aspect');
    });
  });
  describe('name with namespace as part of the name', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.create('aspect', 'ui/my-aspect');
    });
    it('should create the directories properly', () => {
      const compRootDir = path.join(helper.scopes.localPath, helper.scopes.remote, 'ui/my-aspect');
      expect(compRootDir).to.be.a.directory();
      expect(path.join(compRootDir, 'index.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.main.runtime.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.aspect.ts')).to.be.a.file();
    });
    it('should add the component correctly', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('ui/my-aspect');
    });
  });
  describe('name with namespace as part of the name and namespace flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.create('aspect', 'ui/my-aspect', '--namespace another/level');
    });
    it('should create the directories properly', () => {
      const compRootDir = path.join(helper.scopes.localPath, helper.scopes.remote, 'another/level/ui/my-aspect');
      expect(compRootDir).to.be.a.directory();
      expect(path.join(compRootDir, 'index.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.main.runtime.ts')).to.be.a.file();
      expect(path.join(compRootDir, 'my-aspect.aspect.ts')).to.be.a.file();
    });
    it('should add the component correctly', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('another/level/ui/my-aspect');
    });
  });
  describe('when a component already exist on that dir', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.create('aspect', 'my-aspect');
    });
    it('should throw an error', () => {
      expect(() => helper.command.create('aspect', 'my-aspect')).to.throw('this path already exist');

      // make sure the dir still exists and the rollback mechanism did not delete it.
      const compRootDir = path.join(helper.scopes.localPath, helper.scopes.remote, 'my-aspect');
      expect(compRootDir).to.be.a.directory();
    });
  });
  describe('when an error is thrown during the add/track phase', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      expect(() => helper.command.create('aspect', 'myAspect')).to.throw(
        'component names can only contain alphanumeric, lowercase characters'
      );
    });
    it('should not leave the generated component in the filesystem', () => {
      const compRootDir = path.join(helper.scopes.localPath, helper.scopes.remote, 'my-aspect');
      expect(compRootDir).to.not.be.a.path();
    });
  });
  describe('with an invalid scope-name', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
    });
    it('should throw InvalidScopeName error', () => {
      expect(() => helper.command.create('aspect', 'my-aspect', '--scope ui/')).to.throw('"ui/" is invalid');
    });
  });
});
