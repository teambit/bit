import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit lane command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('importing a component when checked out to a lane', () => {
    let beforeImport;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane();
      beforeImport = helper.scopeHelper.cloneLocalScope();
    });
    describe('without --save-in-lane flag', () => {
      before(() => {
        helper.command.importComponent('bar/foo');
      });
      it('the component should not be part of the lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(0);
      });
      it('the component should be available on the lane as part of main', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
      });
      describe('switching to main', () => {
        before(() => {
          helper.command.switchLocalLane('main');
        });
        it('bit list should show the component', () => {
          const list = helper.command.listParsed();
          expect(list).to.have.lengthOf(1);
        });
      });
    });
    describe('with --save-in-lane flag', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeImport);
        helper.command.importComponent('bar/foo --save-in-lane');
      });
      it('the component should be part of the current lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(1);
      });
      describe('switching to main', () => {
        before(() => {
          helper.command.switchLocalLane('main');
        });
        it('bit list should not show the component', () => {
          const list = helper.command.listParsed();
          expect(list).to.have.lengthOf(0);
        });
      });
    });
  });
  describe('importing a (non-lane) component from another scope when checked out to a lane', () => {
    let anotherRemote: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fs.outputFile('bar1/foo1.js', 'console.log("v1");');
      helper.command.addComponent('bar1');
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.fs.outputFile('bar2/foo2.js', 'console.log("v1");');
      helper.command.addComponent('bar2');
      helper.bitJsonc.addToVariant('bar2', 'defaultScope', anotherRemote);
      helper.command.compile();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addRemoteScope(scopePath);

      helper.command.switchRemoteLane('dev');
      helper.command.importComponent('bar1');
    });
    it('should import the component into the current lane', () => {
      const list = helper.command.listLocalScopeParsed();
      const ids = list.map((c) => c.id);
      expect(ids).to.include(`${helper.scopes.remote}/bar1`);
    });
  });
  describe('import a non-lane component that has dependencies into a lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane();
      helper.command.importComponent('comp1 --save-in-lane');
    });
    it('should not save all the dependencies into the lane, only the imported component', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components.length).to.equal(1);
    });
  });
  describe('bit-import with no params when checked out to a lane', () => {
    describe('when the lane is new', () => {
      let importOutput: string;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
        helper.command.createLane('dev');
        helper.fixtures.populateComponents(1);
        helper.command.snapAllComponentsWithoutBuild();
        importOutput = helper.command.import();
      });
      it('should indicate that there is nothing to import because the lane is new', () => {
        expect(importOutput).to.have.string("your lane wasn't exported yet, nothing to import");
      });
    });
    describe('when the lane is exported', () => {
      let importOutput: string;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
        helper.command.createLane('dev');
        helper.fixtures.populateComponents();
        helper.command.snapAllComponents();
        helper.command.exportLane();

        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev');

        importOutput = helper.command.import();
      });
      // before, it was throwing an error about missing head.
      it('should import the remote lane successfully', () => {
        expect(importOutput).to.have.string('successfully imported 3 components');
      });
    });
  });
});
