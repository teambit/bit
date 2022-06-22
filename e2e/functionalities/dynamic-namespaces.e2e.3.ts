import chai, { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('dynamic namespaces', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  const veryLongName = 'this/is/a/very/large/name/for/a/component';
  const veryShortName = 'short';
  [veryLongName, veryShortName].forEach((componentName) => {
    describe(`long and short namespaces. using name "${componentName}"`, () => {
      let tagOutput;
      let catComp;

      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
        helper.fs.createFile('bar', 'foo.js');
        const addOutput = helper.command.addComponent('bar/foo.js', { i: componentName });
        expect(addOutput).to.have.string('added');
        tagOutput = helper.command.tagAllWithoutBuild();
        catComp = helper.command.catComponent(componentName);
      });
      it('should be tagged successfully', () => {
        expect(tagOutput).to.have.string('tagged');
      });
      it('should save the component correctly on the model', () => {
        expect(catComp.name).to.equal(componentName);
      });
      it('should not save anything to the box field', () => {
        expect(catComp).to.not.have.property('box');
      });
      it('bit status should show the component as staged', () => {
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('staged');
        expect(statusOutput).to.have.string(componentName);
      });
      it('bit list should list the component', () => {
        const listOutput = helper.command.listLocalScope();
        expect(listOutput).to.have.string(componentName);
      });
      it('bit show should show the component with the correct name', () => {
        const showOutput = helper.command.showComponentParsed(componentName);
        expect(showOutput.name).to.equal(componentName);
      });
      describe('after import', () => {
        before(() => {
          helper.command.export();
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent(componentName);
        });
        it('should create the directories according to the multiple namespaces', () => {
          expect(path.join(helper.scopes.localPath, 'components', componentName)).to.be.a.path();
          expect(path.join(helper.scopes.localPath, 'components', componentName, 'foo.js')).to.be.a.file();
        });
      });
    });
  });
  describe('import a component with same id string as a local different component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fs.createFile('', 'foo.js');
      helper.command.addComponent('foo.js', { i: 'foo' });
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent('bar/foo.js', { i: `${helper.scopes.remote}/foo` });
    });
    it('should throw an error and not allow the import', () => {
      const output = helper.general.runWithTryCatch(`bit import ${helper.scopes.remote}/foo`);
      expect(output).to.have.string('unable to import');
      const bitMap = helper.bitMap.readComponentsMapOnly();
      expect(Object.keys(bitMap)).to.have.lengthOf(1);
    });
    it('should throw an error also after tagging', () => {
      helper.command.tagAllWithoutBuild();
      const output = helper.general.runWithTryCatch(`bit import ${helper.scopes.remote}/foo`);
      expect(output).to.have.string('unable to import');
    });
  });
});
