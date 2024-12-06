import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
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
        it('bit list should show the component, because it has head', () => {
          const list = helper.command.listParsed();
          expect(list).to.have.lengthOf(1);
        });
      });
    });
  });
  describe('importing a (non-lane) component from another scope when checked out to a lane', () => {
    let anotherRemote: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
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
      helper.workspaceJsonc.addToVariant('bar2', 'defaultScope', anotherRemote);
      helper.command.addComponent('bar2');
      helper.command.compile();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
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
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.command.createLane('dev');
        helper.fixtures.populateComponents(1);
        helper.command.snapAllComponentsWithoutBuild();
        importOutput = helper.command.import();
      });
      it('should indicate that there is nothing to import because the lane is new', () => {
        expect(importOutput).to.have.string('nothing to import');
      });
    });
    describe('when the lane is exported', () => {
      let importOutput: string;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.command.createLane('dev');
        helper.fixtures.populateComponents();
        helper.command.snapAllComponents();
        helper.command.exportLane();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.switchRemoteLane('dev');

        importOutput = helper.command.import();
      });
      // before, it was throwing an error about missing head.
      it('should import the remote lane successfully', () => {
        expect(importOutput).to.have.string('successfully imported 3 components');
      });
    });
    describe('when the objects were deleted and a workspace has an aspect with deps', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.command.createLane();
        helper.command.create('bit-aspect', 'my-aspect');
        helper.fixtures.populateComponents();
        helper.fs.outputFile(
          `${helper.scopes.remote}/my-aspect/foo.ts`,
          `import comp1 from '@${helper.scopes.remote}/comp1';`
        );
        helper.command.compile();
        // helper.command.use(`${helper.scopes.remote}/my-aspect`); // doesn't work
        helper.workspaceJsonc.addKeyVal(`${helper.scopes.remote}/my-aspect`, {});
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.export();
        helper.fs.deletePath('.bit');
        helper.scopeHelper.addRemoteScope();
      });
      // previously, it was throwing the following error:
      // component bwkyh1me-remote/comp1 missing data. parent 0a27abfb2cab6ed73a36323216a5e95cba98ede0 of version 9e2e99134fa0465c4efa7c8f089fe33cf61e4c1a was not found.
      it('bit import should not throw', () => {
        expect(() => helper.command.import()).to.not.throw();
      });
    });
    describe('when the components on the lane have history other than head on main', () => {
      let localScope: string;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateComponents(1);
        helper.command.tagAllWithoutBuild(); // 0.0.1
        helper.command.export();
        helper.command.createLane();
        helper.command.snapAllComponentsWithoutBuild('--unmodified');
        helper.command.export();
        helper.command.switchLocalLane('main', '--skip-dependency-installation');
        helper.command.tagAllWithoutBuild('--unmodified'); // 0.0.2
        helper.command.tagAllWithoutBuild('--unmodified'); // 0.0.3
        helper.command.export();
        helper.command.switchLocalLane('dev', '--skip-dependency-installation');
        helper.fs.deletePath('.bit');
        helper.command.init();
        helper.scopeHelper.addRemoteScope();
        helper.command.import();
        localScope = helper.scopeHelper.cloneLocalScope();
      });
      it('should not bring main (for performance reasons)', () => {
        const comp = helper.command.catComponent(`${helper.scopes.remote}/comp1`);
        const v1Hash = comp.versions['0.0.1'];
        const v2Hash = comp.versions['0.0.2'];
        const v3Hash = comp.versions['0.0.3'];
        expect(() => helper.command.catObject(v1Hash)).to.throw();
        expect(() => helper.command.catObject(v2Hash)).to.throw();
        expect(() => helper.command.catObject(v3Hash)).to.throw(); // coz it's the head
      });
      it('should bring all history if fetch --lanes --all-history was used', () => {
        helper.command.fetchAllLanes('--all-history');
        const comp = helper.command.catComponent(`${helper.scopes.remote}/comp1`);
        const v2Hash = comp.versions['0.0.2'];
        expect(() => helper.command.catObject(v2Hash)).to.not.throw();
      });
      it('should import the history if "bit log" was running', () => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.command.log(`${helper.scopes.remote}/comp1`);
        const comp = helper.command.catComponent(`${helper.scopes.remote}/comp1`);
        const v1Hash = comp.versions['0.0.1'];
        expect(() => helper.command.catObject(v1Hash)).to.not.throw();
      });
    });
  });
  describe('import objects for multiple lanes', () => {
    let afterFirstSnap: string;
    let secondSnapMain: string;
    let secondSnapLaneA: string;
    let secondSnapLaneB: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      afterFirstSnap = helper.scopeHelper.cloneLocalScope();

      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      secondSnapLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.switchLocalLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      secondSnapLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.switchLocalLane('main');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      secondSnapMain = helper.command.getHead('comp1');

      helper.scopeHelper.getClonedLocalScope(afterFirstSnap);
    });
    it('bit fetch --lane should bring updates for all lanes', () => {
      helper.command.fetchAllLanes();
      expect(helper.command.getHeadOfLane('lane-a', 'comp1')).to.equal(secondSnapLaneA, 'lane-a was not updated');
      expect(helper.command.getHeadOfLane('lane-b', 'comp1')).to.equal(secondSnapLaneB, 'lane-b was not updated');
      expect(helper.command.getHead('comp1')).to.equal(secondSnapMain, 'main was not updated');
    });
  });
  describe('import previous version from main when on a lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane();
      helper.command.importComponent('comp1@0.0.1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    // previous bug showed this component in the pending-updates section.
    // it was because the calculation whether it's up-to-date was based also on the component-head.
    // it should be based on the remote-lane object only.
    it('bit status should not show the component as pending-updates because it does not exits on the remote lane', () => {
      const status = helper.command.statusJson();
      expect(status.outdatedComponents).to.have.lengthOf(0);
    });
  });
  describe('import with wildcards when a component exists on both, main and lane', () => {
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();
      helper.command.importComponent('**', '-x');
    });
    it('should not checkout to the main version', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.not.equal('0.0.1');
      expect(bitmap.comp1.version).to.equal(headOnLane);
    });
  });
  describe('import with wildcard when a component is on main and user is checked out to a lane', () => {
    let beforeImport: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      beforeImport = helper.scopeHelper.cloneLocalScope();
    });
    describe('when the wildcard is parsed to only main', () => {
      before(() => {
        helper.command.importComponent('bar/*', '-x');
      });
      it('should import from main', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(2);
        const ids = list.map((c) => c.id);
        expect(ids).to.include(`${helper.scopes.remote}/bar/foo`);
      });
    });
    describe('when the wildcard is parsed to components in the lane and in main', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeImport);
        helper.command.importComponent('**', '-x');
      });
      it('should import only the components from the lane, not main', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
        const ids = list.map((c) => c.id);
        expect(ids[0]).to.equal(`${helper.scopes.remote}/comp1`);
      });
    });
  });
});
