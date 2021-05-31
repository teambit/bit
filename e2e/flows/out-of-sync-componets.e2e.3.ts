import chai, { expect } from 'chai';

import { IMPORT_PENDING_MSG } from '../../src/constants';
import { MissingBitMapComponent } from '../../src/consumer/bit-map/exceptions';
import ComponentsPendingImport from '../../src/consumer/component-ops/exceptions/components-pending-import';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('components that are not synced between the scope and the consumer', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('consumer with a new component and scope with the same component as staged', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      const bitMap = helper.bitMap.read();
      helper.fixtures.tagComponentBarFoo();
      helper.bitMap.write(bitMap);
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.command.runCmd('bit tag bar/foo --force --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        output = helper.command.status();
      });
      it('should sync .bitmap according to the scope', () => {
        expect(output).to.have.string('staged');
        const bitMap = helper.bitMap.read();
        const newId = 'bar/foo@0.0.1';
        expect(bitMap).to.have.property(newId);
        expect(bitMap[newId].exported).to.be.false;
      });
    });
    describe('bit export with id', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.scopeHelper.reInitRemoteScope();
        output = helper.command.exportComponent('bar/foo');
      });
      it('should export the component successfully', () => {
        expect(output).to.have.string('exported 1 components');
      });
    });
    describe('bit export all', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.scopeHelper.reInitRemoteScope();
        output = helper.command.exportAllComponents();
      });
      it('should export the component successfully', () => {
        expect(output).to.have.string('exported 1 components');
      });
    });
  });
  describe('consumer with a new component and scope with the same component as exported', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      const bitMap = helper.bitMap.read();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportAllComponents();
      helper.bitMap.write(bitMap);
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.command.runCmd('bit tag bar/foo --force --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.command.status();
      });
      it('should sync .bitmap according to the scope', () => {
        helper.command.expectStatusToBeClean();
        const bitMap = helper.bitMap.read();
        const newId = `${helper.scopes.remote}/bar/foo@0.0.1`;
        expect(bitMap).to.have.property(newId);
        expect(bitMap[newId].exported).to.be.true;
      });
    });
  });
  describe('consumer with a new component and scope with the same component as exported with defaultScope configured', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      const bitMap = helper.bitMap.read();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // the mimic and import here is to make sure the local doesn't have the symlink object
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importAllComponents();
      helper.bitMap.write(bitMap);
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.command.runCmd('bit tag bar/foo --force --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.command.status();
      });
      it('should sync .bitmap according to the scope', () => {
        helper.command.expectStatusToBeClean();
        helper.bitMap.expectToHaveIdHarmony('bar/foo', '0.0.1', helper.scopes.remote);
      });
    });
  });
  describe('consumer with a tagged component and scope with the same component as exported', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      const bitMap = helper.bitMap.read();
      helper.command.exportAllComponents();
      helper.bitMap.write(bitMap);
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.command.runCmd('bit tag bar/foo --force --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.command.status();
      });
      it('should sync .bitmap according to the scope', () => {
        helper.command.expectStatusToBeClean();
        const bitMap = helper.bitMap.read();
        const newId = `${helper.scopes.remote}/bar/foo@0.0.1`;
        expect(bitMap).to.have.property(newId);
        expect(bitMap[newId].exported).to.be.true;
      });
    });
  });
  describe('consumer with a tagged component and scope with no components', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.fs.deletePath('.bit');
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component successfully as if the component is new', () => {
        const output = helper.command.runCmd('bit tag bar/foo');
        expect(output).to.have.string('0.0.1');
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        output = helper.command.status();
      });
      it('should show the component as new', () => {
        expect(output).to.have.string('new components');
        const bitMap = helper.bitMap.read();
        const newId = 'bar/foo';
        expect(bitMap).to.have.property(newId);
        const oldId = 'bar/foo@0.0.1';
        expect(bitMap).to.not.have.property(oldId);
      });
    });
    describe('bit show', () => {
      it('should not show the component with the version', () => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        const show = helper.command.showComponent('bar/foo');
        expect(show).to.not.have.string('0.0.1');
      });
    });
  });
  describe('consumer with no components and scope with staged components', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.bitMap.delete();
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        output = helper.command.status();
      });
      it('should show the component as staged', () => {
        expect(output).to.have.string('staged components');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string('0.0.1');
      });
    });
    describe('bit show', () => {
      it('should not show the component because it is not available locally', () => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        const showFunc = () => helper.command.showComponent('bar/foo');
        const error = new MissingBitMapComponent('bar/foo');
        helper.general.expectToThrow(showFunc, error);
      });
    });
    describe('bit export all', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        output = helper.command.exportAllComponents();
      });
      it('should export the component successfully', () => {
        const lsRemote = helper.command.listRemoteScopeParsed();
        expect(lsRemote).to.have.lengthOf(1);
        expect(lsRemote[0].id).to.have.string('bar/foo');
      });
      it('should tell the user that no local changes have been made because the components are not tracked', () => {
        expect(output).to.have.string('bit did not update the workspace as the component files are not tracked');
      });
    });
    describe('bit export id', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.scopeHelper.reInitRemoteScope();
        output = helper.command.exportComponent('bar/foo');
      });
      it('should export the component successfully', () => {
        const lsRemote = helper.command.listRemoteScopeParsed();
        expect(lsRemote).to.have.lengthOf(1);
        expect(lsRemote[0].id).to.have.string('bar/foo');
      });
      it('should tell the user that no local changes have been made because the components are not tracked', () => {
        expect(output).to.have.string('bit did not update the workspace as the component files are not tracked');
      });
    });
  });
  describe('consumer with no components and scope with exported components', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportAllComponents();
      helper.bitMap.delete();
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit add of the same component', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.fixtures.addComponentBarFoo();
      });
      it('should sync the new component with the scope and assign a version and a scope name', () => {
        const bitMap = helper.bitMap.read();
        const newId = `${helper.scopes.remote}/bar/foo@0.0.1`;
        expect(bitMap).to.have.property(newId);
      });
    });
  });
  describe('consumer has exported components and scope is empty', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportAllComponents();
      helper.fs.deletePath('.bit');
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should stop the tagging process and throw an error suggesting to import the components', () => {
        const err = new ComponentsPendingImport();
        helper.general.expectToThrow(() => helper.command.tagAllComponents(), err);
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        output = helper.command.status();
      });
      it('should show a massage suggesting to import the components', () => {
        expect(output).to.have.string(IMPORT_PENDING_MSG);
      });
    });
  });
  describe('consumer has tagged component with a version that not exist in the scope', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.tagScope('2.0.0');
      const bitMap = helper.bitMap.read();
      helper.command.untag('bar/foo@2.0.0');
      helper.bitMap.write(bitMap);
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.command.runCmd('bit tag bar/foo --force --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        output = helper.command.status();
      });
      it('should sync .bitmap according to the scope', () => {
        expect(output).to.have.string('staged components');
        const bitMap = helper.bitMap.read();
        const newId = 'bar/foo@0.0.1';
        expect(bitMap).to.have.property(newId);
      });
    });
  });
  describe('consumer has exported component with a version that not exist in the scope', () => {
    describe('when the remote component has this missing version', () => {
      let scopeAfterV1;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.fixtures.tagComponentBarFoo();
        helper.command.exportAllComponents();
        scopeAfterV1 = helper.scopeHelper.cloneLocalScope();
        helper.command.tagScope('2.0.0');
        helper.command.exportAllComponents();
        const bitMap = helper.bitMap.read();
        helper.scopeHelper.getClonedLocalScope(scopeAfterV1);
        helper.bitMap.write(bitMap);
      });
      describe('bit status', () => {
        it('should throw an error suggesting to import the components', () => {
          const err = new ComponentsPendingImport();
          helper.general.expectToThrow(() => helper.command.status(), err);
        });
      });
      describe('bit show', () => {
        it('should throw an error suggesting to import the components', () => {
          const err = new ComponentsPendingImport();
          helper.general.expectToThrow(() => helper.command.showComponent('bar/foo'), err);
        });
      });
      describe('bit tag', () => {
        it('should throw an error suggesting to import the components', () => {
          const err = new ComponentsPendingImport();
          helper.general.expectToThrow(() => helper.command.tagAllComponents(), err);
        });
      });
    });
    describe('when the remote component does not exist or does not have this missing version', () => {
      let scopeAfterV1;
      let scopeOutOfSync;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.fixtures.tagComponentBarFoo();
        helper.command.exportAllComponents();
        scopeAfterV1 = helper.scopeHelper.cloneLocalScope();
        helper.command.tagScope('2.0.0');
        helper.command.exportAllComponents();
        const bitMap = helper.bitMap.read();
        helper.scopeHelper.getClonedLocalScope(scopeAfterV1);
        helper.bitMap.write(bitMap);
        helper.command.removeComponent(`${helper.scopes.remote}/bar/foo`, '-r');
        scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
      });
      describe('bit status', () => {
        before(() => {
          helper.command.status();
        });
        it('should sync .bitmap according to the latest version of the scope', () => {
          helper.command.expectStatusToBeClean();
          const bitMap = helper.bitMap.read();
          const newId = `${helper.scopes.remote}/bar/foo@0.0.1`;
          expect(bitMap).to.have.property(newId);
        });
      });
      describe('bit tag', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        });
        it('should tag the component to the next version of what the scope has', () => {
          const output = helper.command.runCmd('bit tag bar/foo --force --patch');
          expect(output).to.have.string('0.0.2');
        });
      });
    });
  });
});
