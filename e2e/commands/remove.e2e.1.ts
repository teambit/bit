import { IssuesClasses } from '@teambit/component-issues';
import chai, { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('bit remove command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('with tagged components and --track=false ', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      output = helper.command.removeComponent('bar/foo');
    });
    it('should remove component', () => {
      expect(output).to.have.string('removed components');
      expect(output).to.have.string('bar/foo');
    });
    it('should not show in bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('bar/foo');
    });
    it('removed component should not be in new component when checking status', () => {
      const listOutput = helper.command.listLocalScope();
      expect(listOutput).to.not.have.string('bar/foo');
      const status = helper.command.runCmd('bit status');
      expect(status.includes('bar/foo')).to.be.false;
    });
  });
  describe('with tagged components and -t=true', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.command.removeComponent('bar/foo', '-t --keep-files');
    });
    it('should show in bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property('bar/foo');
    });
    it('removed component should  be in new component', () => {
      const listOutput = helper.command.listLocalScope();
      expect(listOutput).to.not.have.string('bar/foo');
      const status = helper.command.runCmd('bit status');
      expect(status.includes('new components')).to.be.true;
      expect(status.includes('bar/foo')).to.be.true;
    });
  });
  describe('with remote scope without dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.command.export();
    });
    describe('without --remote flag', () => {
      let output;
      before(() => {
        output = helper.command.removeComponent(`${helper.scopes.remote}/bar/foo`);
      });
      it('should show a successful message', () => {
        expect(output).to.have.string('removed components');
        expect(output).to.have.string(`${helper.scopes.remote}/bar/foo`);
      });
      it('should remove the component from the local scope', () => {
        const lsScope = helper.command.listLocalScope();
        expect(lsScope).to.have.string('found 0 components');
      });
      it('should not remove the component from the remote scope', () => {
        const lsScope = helper.command.listRemoteScopeIds();
        expect(lsScope).to.not.have.string('found 0 components');
      });
    });
    describe('with --remote flag', () => {
      let output;
      before(() => {
        output = helper.command.removeComponent(`${helper.scopes.remote}/bar/foo --remote`);
      });
      it('should show a successful message', () => {
        expect(output).to.have.string(`removed components from the remote scope: ${helper.scopes.remote}/bar/foo`);
      });
      it('should remove the component from the remote scope', () => {
        const lsScope = helper.command.listRemoteScopeIds();
        expect(lsScope).to.have.string('found 0 components');
      });
    });
  });
  describe('with remote scope with dependencies', () => {
    const componentName = 'comp2';
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    it('should not remove component with dependencies when -f flag is false', () => {
      const output = helper.command.removeComponent(`${helper.scopes.remote}/${componentName}`);
      expect(output).to.have.string(
        `error: unable to delete ${helper.scopes.remote}/${componentName}, because the following components depend on it:`
      );
    });
    it('should remove component with dependencies when -f flag is true', () => {
      const output = helper.command.removeComponent(`${helper.scopes.remote}/${componentName}`, '-f');
      expect(output).to.have.string('removed components');
      expect(output).to.have.string(`${helper.scopes.remote}/${componentName}`);
    });
  });
  describe('with imported components, no dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    it('should remove components with no dependencies when -f flag is false', () => {
      const output = helper.command.removeComponent(`${helper.scopes.remote}/bar/foo`);
      expect(output).to.have.string('removed components');
      expect(output).to.have.string(`${helper.scopes.remote}/bar/foo`);
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property(`bar/foo`);
    });
  });
  describe('remove modified component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.fs.appendFile('bar/foo.js');
    });
    it('should not remove modified component ', () => {
      const output = helper.command.removeComponent('bar/foo@0.0.1');
      expect(output).to.have.string('error: unable to remove modified components');
      expect(output).to.have.string('bar/foo');
    });
  });
  describe('remove a component when the main file is missing', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.createFile('bar', 'foo.js');
      helper.fs.createFile('bar', 'foo-main.js');
      helper.command.addComponent('bar', { m: 'foo-main.js', i: 'bar/foo' });
      helper.command.tagAllWithoutBuild();
      helper.fs.deletePath('bar/foo-main.js');
      const status = helper.command.status();
      expect(status).to.have.string('main-file was removed');
      output = helper.command.removeComponent('bar/foo');
    });
    it('should remove the component successfully', () => {
      expect(output).to.have.string('successfully removed component');
    });
  });
  // todo: not sure this test makes sense. it was converted from the legacy somehow
  describe('remove a component when a dependency has a file with the same content as other component file', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(2);
      helper.fs.outputFile('comp2/index.js', fixtures.isType);
      helper.fs.outputFile('comp2-b/index.js', fixtures.isType);
      helper.command.addComponent('comp2-b');
      helper.command.tagAllWithoutBuild();

      // this additional is to prevent another bug, where nested are imported only with their
      // latest version and then when 'bit remove' tries to remove all versions array of
      // ModelComponent, it doesn't find some of them and throws ENOENT error
      helper.command.tagIncludeUnmodified('1.0.0');

      helper.command.export();
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1');
      helper.command.importComponent('comp2');

      // now, the hash "b417426ea2f7f0e80fa2ee2e6c825e18fcb8a897", which has the content of fixtures.isType
      // is shared between two components: utils/is-type and utils/is-type2
      // deleting utils/is-string, causes removal of its dependency utils/is-type as well.
      // a previous bug, deleted also the files associated with utils/is-type, leaving utils/is-type2
      // with missing files from the scope.
      output = helper.command.removeComponent('comp1');
    });
    it('should successfully remove', () => {
      expect(output).to.have.string('removed components');
    });
    it('bit status should not throw an error about missing file from the model', () => {
      const statusCmd = () => helper.command.status();
      expect(statusCmd).to.not.throw();
    });
    it('expect the shared hash to not be deleted', () => {
      const hashLocation = path.join(helper.scopes.localPath, '.bit/objects/b4/17426ea2f7f0e80fa2ee2e6c825e18fcb8a897');
      expect(hashLocation).to.be.a.file();
    });
  });
  describe.only('soft remove', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.command.removeComponent('comp2', '--soft');
    });
    it('bit status should show a section of removed components', () => {
      const status = helper.command.statusJson();
      expect(status.removedComponents).to.have.lengthOf(1);
    });
    it('bit status should show the dependent component with an issue because it is now missing the dependency', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
    });
    describe('tagging the component', () => {
      before(() => {
        helper.fs.outputFile('comp1/index.js', '');
        helper.command.tagAllWithoutBuild();
      });
      it('should tag the removed components', () => {
        const isStaged = helper.command.statusComponentIsStaged('comp2');
        expect(isStaged).to.be.true;
      });
      describe('exporting the components', () => {
        let exportOutput: string;
        before(() => {
          exportOutput = helper.command.export();
        });
        it('should export the deleted components', () => {
          expect(exportOutput).to.have.string('2 component');
        });
        it('bit status should be clean', () => {
          helper.command.expectStatusToBeClean();
        });
      });
    });
  });
});
