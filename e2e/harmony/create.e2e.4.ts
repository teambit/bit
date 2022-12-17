import chai, { expect } from 'chai';
import { OutsideWorkspaceError } from '@teambit/workspace';
import path from 'path';
import os from 'os';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('create extension', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when running outside the workspace', () => {
    it('should throw ConsumerNotFound error', () => {
      const cmd = () => helper.command.runCmd('bit create aspect my-aspect', os.tmpdir());
      const error = new OutsideWorkspaceError();
      helper.general.expectToThrow(cmd, error);
    });
  });
  describe('with --namespace flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
    });
    it('should throw InvalidScopeName error', () => {
      expect(() => helper.command.create('aspect', 'my-aspect', '--scope ui/')).to.throw('"ui/" is invalid');
    });
  });
  describe('with --scope flag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes({ addRemoteScopeAsDefaultScope: false });
      helper.bitJsonc.addDefaultScope('my-scope');
      helper.command.create('aspect', 'my-aspect', `--scope ${helper.scopes.remote}`);
    });
    it('should add the component to the .bitmap file with a new defaultScope prop', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('my-aspect');
      expect(bitMap['my-aspect']).to.have.property('defaultScope');
      expect(bitMap['my-aspect'].defaultScope).to.equal(helper.scopes.remote);
    });
    it('bit show should show this scope as the defaultScope', () => {
      const show = helper.command.showComponent('my-aspect');
      expect(show).to.include(helper.scopes.remote);
    });
    describe('exporting the component', () => {
      before(() => {
        helper.command.tagAllWithoutBuild('--ignore-issues "*"');
        // the fact the export succeed, means the defaultScope from .bitmap taken into account
        // otherwise, it would have been used the workspace.jsonc defaultScope "my-scope" and fails.
        helper.command.export();
      });
      it('should delete the defaultScope prop from .bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.have.property('my-aspect');
        expect(bitMap['my-aspect']).to.not.have.property('defaultScope');
      });
    });
  });
  describe('with env defined inside the aspect-template different than the variants', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.extensions.addExtensionToVariant('*', 'teambit.react/react', {});
      helper.command.create('aspect', 'my-aspect', `--scope ${helper.scopes.remote}`);
    });
    it('should set the env according to the variant', () => {
      const show = helper.command.showComponentParsedHarmony('my-aspect');
      const env = show.find((item) => item.title === 'env');
      expect(env.json).to.equal('teambit.react/react');
    });
  });
  describe('with env defined inside the aspect-template when there is no variant', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.create('aspect', 'my-aspect', `--scope ${helper.scopes.remote}`);
    });
    it('should set the env according to the template env', () => {
      const show = helper.command.showComponentParsedHarmony('my-aspect');
      const env = show.find((item) => item.title === 'env');
      expect(env.json).to.equal('teambit.harmony/aspect');
    });
  });
});
