import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('dynamic namespaces', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  const veryLongName = 'this/is/a/very/large/name/for/a/component';
  const veryShortName = 'short';
  [veryLongName, veryShortName].forEach((componentName) => {
    describe(`long and short namespaces. using name "${componentName}"`, () => {
      let tagOutput;
      let catComp;

      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.fs.createFile('bar', 'foo.js');
        const addOutput = helper.command.addComponent('bar/foo.js', { i: componentName });
        expect(addOutput).to.have.string('added');
        tagOutput = helper.command.tagAllComponents();
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
      it('bit log should show the component log', () => {
        const logOutput = helper.command.runCmd(`bit log ${componentName}`);
        expect(logOutput).to.have.string('tag');
        expect(logOutput).to.have.string('author');
        expect(logOutput).to.have.string('date');
      });
      describe('after import', () => {
        before(() => {
          helper.command.exportAllComponents();
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.command.importComponent(componentName);
        });
        it('should create the directories according to the multiple namespaces', () => {
          expect(path.join(helper.localScopePath, 'components', componentName)).to.be.a.path();
          expect(path.join(helper.localScopePath, 'components', componentName, 'foo.js')).to.be.a.file();
        });
      });
    });
  });
  describe('import a component with same id string as a local different component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('', 'foo.js');
      helper.command.addComponent('foo.js', { i: 'foo' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.fs.createFile('bar', 'foo.js');
      helper.command.addComponent('bar/foo.js', { i: `${helper.remoteScope}/foo` });
    });
    it('should throw an error and not allow the import', () => {
      const output = helper.runWithTryCatch(`bit import ${helper.remoteScope}/foo`);
      expect(output).to.have.string('unable to import');
      const bitMap = helper.bitMap.readBitMapWithoutVersion();
      expect(Object.keys(bitMap)).to.have.lengthOf(1);
    });
    it('should throw an error also after tagging', () => {
      helper.command.tagAllComponents();
      const output = helper.runWithTryCatch(`bit import ${helper.remoteScope}/foo`);
      expect(output).to.have.string('unable to import');
    });
  });
});
