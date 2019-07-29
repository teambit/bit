import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import { statusWorkspaceIsCleanMsg, importPendingMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { MissingBitMapComponent } from '../../src/consumer/bit-map/exceptions';
import ComponentsPendingImport from '../../src/consumer/component-ops/exceptions/components-pending-import';

chai.use(require('chai-fs'));

describe('components that are not synced between the scope and the consumer', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('consumer with a new component and scope with the same component as staged', () => {
    let scopeOutOfSync;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      const bitMap = helper.readBitMap();
      helper.tagComponentBarFoo();
      helper.writeBitMap(bitMap);
      scopeOutOfSync = helper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.runCmd('bit tag bar/foo --force --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        output = helper.status();
      });
      it('should sync .bitmap according to the scope', () => {
        expect(output).to.have.string('staged');
        const bitMap = helper.readBitMap();
        const newId = 'bar/foo@0.0.1';
        expect(bitMap).to.have.property(newId);
        expect(bitMap[newId].exported).to.be.false;
      });
    });
    describe('bit export with id', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        helper.reInitRemoteScope();
        output = helper.exportComponent('bar/foo');
      });
      it('should export the component successfully', () => {
        expect(output).to.have.string('exported 1 components');
      });
    });
    describe('bit export all', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        helper.reInitRemoteScope();
        output = helper.exportAllComponents();
      });
      it('should export the component successfully', () => {
        expect(output).to.have.string('exported 1 components');
      });
    });
  });
  describe('consumer with a new component and scope with the same component as exported', () => {
    let scopeOutOfSync;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      const bitMap = helper.readBitMap();
      helper.tagComponentBarFoo();
      helper.exportAllComponents();
      helper.writeBitMap(bitMap);
      scopeOutOfSync = helper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.runCmd('bit tag bar/foo --force --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        output = helper.status();
      });
      it('should sync .bitmap according to the scope', () => {
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        const bitMap = helper.readBitMap();
        const newId = `${helper.remoteScope}/bar/foo@0.0.1`;
        expect(bitMap).to.have.property(newId);
        expect(bitMap[newId].exported).to.be.true;
      });
    });
  });
  describe('consumer with a tagged component and scope with the same component as exported', () => {
    let scopeOutOfSync;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      const bitMap = helper.readBitMap();
      helper.exportAllComponents();
      helper.writeBitMap(bitMap);
      scopeOutOfSync = helper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.runCmd('bit tag bar/foo --force --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        output = helper.status();
      });
      it('should sync .bitmap according to the scope', () => {
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        const bitMap = helper.readBitMap();
        const newId = `${helper.remoteScope}/bar/foo@0.0.1`;
        expect(bitMap).to.have.property(newId);
        expect(bitMap[newId].exported).to.be.true;
      });
    });
  });
  describe('consumer with a tagged component and scope with no components', () => {
    let scopeOutOfSync;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.deletePath('.bit');
      scopeOutOfSync = helper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component successfully as if the component is new', () => {
        const output = helper.runCmd('bit tag bar/foo');
        expect(output).to.have.string('0.0.1');
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        output = helper.status();
      });
      it('should show the component as new', () => {
        expect(output).to.have.string('new components');
        const bitMap = helper.readBitMap();
        const newId = 'bar/foo';
        expect(bitMap).to.have.property(newId);
        const oldId = 'bar/foo@0.0.1';
        expect(bitMap).to.not.have.property(oldId);
      });
    });
    describe('bit show', () => {
      it('should not show the component with the version', () => {
        helper.getClonedLocalScope(scopeOutOfSync);
        const show = helper.showComponent('bar/foo');
        expect(show).to.not.have.string('0.0.1');
      });
    });
  });
  describe('consumer with no components and scope with staged components', () => {
    let scopeOutOfSync;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.deleteBitMap();
      scopeOutOfSync = helper.cloneLocalScope();
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        output = helper.status();
      });
      it('should show the component as staged', () => {
        expect(output).to.have.string('staged components');
        expect(output).to.have.string('bar/foo');
        expect(output).to.have.string('0.0.1');
      });
    });
    describe('bit show', () => {
      it('should not show the component because it is not available locally', () => {
        helper.getClonedLocalScope(scopeOutOfSync);
        const showFunc = () => helper.showComponent('bar/foo');
        const error = new MissingBitMapComponent('bar/foo');
        helper.expectToThrow(showFunc, error);
      });
    });
    describe('bit export all', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        output = helper.exportAllComponents();
      });
      it('should export the component successfully', () => {
        const lsRemote = helper.listRemoteScopeParsed();
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
        helper.getClonedLocalScope(scopeOutOfSync);
        helper.reInitRemoteScope();
        output = helper.exportComponent('bar/foo');
      });
      it('should export the component successfully', () => {
        const lsRemote = helper.listRemoteScopeParsed();
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
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.exportAllComponents();
      helper.deleteBitMap();
      scopeOutOfSync = helper.cloneLocalScope();
    });
    describe('bit add of the same component', () => {
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        helper.addComponentBarFoo();
      });
      it('should sync the new component with the scope and assign a version and a scope name', () => {
        const bitMap = helper.readBitMap();
        const newId = `${helper.remoteScope}/bar/foo@0.0.1`;
        expect(bitMap).to.have.property(newId);
      });
    });
  });
  describe('consumer has exported components and scope is empty', () => {
    let scopeOutOfSync;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.exportAllComponents();
      helper.deletePath('.bit');
      scopeOutOfSync = helper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should stop the tagging process and throw an error suggesting to import the components', () => {
        const err = new ComponentsPendingImport();
        helper.expectToThrow(() => helper.tagAllComponents(), err);
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        output = helper.status();
      });
      it('should show a massage suggesting to import the components', () => {
        expect(output).to.have.string(importPendingMsg);
      });
    });
  });
  describe('consumer has tagged component with a version that not exist in the scope', () => {
    let scopeOutOfSync;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.tagScope('2.0.0');
      const bitMap = helper.readBitMap();
      helper.untag('bar/foo@2.0.0');
      helper.writeBitMap(bitMap);
      scopeOutOfSync = helper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.runCmd('bit tag bar/foo --force --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(scopeOutOfSync);
        output = helper.status();
      });
      it('should sync .bitmap according to the scope', () => {
        expect(output).to.have.string('staged components');
        const bitMap = helper.readBitMap();
        const newId = 'bar/foo@0.0.1';
        expect(bitMap).to.have.property(newId);
      });
    });
  });
  describe('consumer has exported component with a version that not exist in the scope', () => {
    describe('when the remote component has this missing version', () => {
      let scopeAfterV1;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.tagComponentBarFoo();
        helper.exportAllComponents();
        scopeAfterV1 = helper.cloneLocalScope();
        helper.tagScope('2.0.0');
        helper.exportAllComponents();
        const bitMap = helper.readBitMap();
        helper.getClonedLocalScope(scopeAfterV1);
        helper.writeBitMap(bitMap);
      });
      describe('bit status', () => {
        it('should throw an error suggesting to import the components', () => {
          const err = new ComponentsPendingImport();
          helper.expectToThrow(() => helper.status(), err);
        });
      });
      describe('bit show', () => {
        it('should throw an error suggesting to import the components', () => {
          const err = new ComponentsPendingImport();
          helper.expectToThrow(() => helper.showComponent('bar/foo'), err);
        });
      });
      describe('bit tag', () => {
        it('should throw an error suggesting to import the components', () => {
          const err = new ComponentsPendingImport();
          helper.expectToThrow(() => helper.tagAllComponents(), err);
        });
      });
    });
    describe('when the remote component does not exist or does not have this missing version', () => {
      let scopeAfterV1;
      let scopeOutOfSync;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.tagComponentBarFoo();
        helper.exportAllComponents();
        scopeAfterV1 = helper.cloneLocalScope();
        helper.tagScope('2.0.0');
        helper.exportAllComponents();
        const bitMap = helper.readBitMap();
        helper.getClonedLocalScope(scopeAfterV1);
        helper.writeBitMap(bitMap);
        helper.removeComponent(`${helper.remoteScope}/bar/foo`, '-r -s');
        scopeOutOfSync = helper.cloneLocalScope();
      });
      describe('bit status', () => {
        let output;
        before(() => {
          output = helper.status();
        });
        it('should sync .bitmap according to the latest version of the scope', () => {
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
          const bitMap = helper.readBitMap();
          const newId = `${helper.remoteScope}/bar/foo@0.0.1`;
          expect(bitMap).to.have.property(newId);
        });
      });
      describe('bit tag', () => {
        before(() => {
          helper.getClonedLocalScope(scopeOutOfSync);
        });
        it('should tag the component to the next version of what the scope has', () => {
          const output = helper.runCmd('bit tag bar/foo --force --patch');
          expect(output).to.have.string('0.0.2');
        });
      });
    });
  });
});
