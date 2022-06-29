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
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('consumer with a new component and scope with the same component as staged', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
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
        expect(bitMap['bar/foo'].version).to.equal('0.0.1');
      });
    });
    describe('bit export with id', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.scopeHelper.reInitRemoteScope();
        output = helper.command.exportIds('bar/foo');
      });
      it('should export the component successfully', () => {
        expect(output).to.have.string('exported the following 1 component(s)');
      });
    });
    describe('bit export all', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.scopeHelper.reInitRemoteScope();
        output = helper.command.export();
      });
      it('should export the component successfully', () => {
        expect(output).to.have.string('exported the following 1 component');
      });
    });
  });
  describe('consumer with a tagged component and scope with the same component as exported', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      const bitMap = helper.bitMap.read();
      helper.command.export();
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
        expect(bitMap['bar/foo'].scope).to.equal(helper.scopes.remote);
        expect(bitMap['bar/foo'].version).to.equal('0.0.1');
      });
    });
  });
  describe('consumer with no components and scope with staged components', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.bitMap.delete();
      helper.command.init('--force');
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    // @TODO: FIX ON HARMONY!
    // it should not show the component as staged because it is not in the bitmap.
    describe.skip('bit status', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        output = helper.command.status();
      });
      it('should not show the component as staged', () => {
        expect(output).to.not.have.string('staged components');
      });
    });
    describe('bit show', () => {
      it('should not throw because "bit show" supports showing components from the scope', () => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        const showFunc = () => helper.command.showComponent('bar/foo');
        expect(showFunc).to.not.throw();
      });
    });
    // @TODO: FIX ON HARMONY!
    // currently it throws MissingBitMapComponent because the component is not in the bitmap and is staged.
    // it should probably show "nothing to export"
    describe.skip('bit export all', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        output = helper.command.export();
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
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.scopeHelper.reInitRemoteScope();
      });
      it('should throw an error saying the component does not exist', () => {
        const exportFunc = () => helper.command.exportIds('bar/foo');
        const err = new MissingBitMapComponent('bar/foo');
        helper.general.expectToThrow(exportFunc, err);
      });
    });
  });
  describe('consumer with no components and scope with exported components', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.command.export();
      helper.bitMap.delete();
      helper.command.init('--force');
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit add of the same component', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.fixtures.addComponentBarFooAsDir();
      });
      it('should sync the new component with the scope and assign a version and a scope name', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap['bar/foo'].scope).to.equal(helper.scopes.remote);
        expect(bitMap['bar/foo'].version).to.equal('0.0.1');
      });
    });
  });
  describe('consumer has exported components and scope is empty', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.command.export();
      helper.fs.deletePath('.bit');
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should stop the tagging process and throw an error suggesting to import the components', () => {
        const err = new ComponentsPendingImport();
        helper.general.expectToThrow(() => helper.command.tagAllWithoutBuild(), err);
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.command.tagIncludeUnmodified('2.0.0');
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
        expect(bitMap['bar/foo'].version).to.equal('0.0.1');
      });
    });
  });
  describe('consumer has exported component with a version that not exist in the scope', () => {
    describe('when the remote component has this missing version', () => {
      let scopeAfterV1;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.fixtures.tagComponentBarFoo();
        helper.command.export();
        scopeAfterV1 = helper.scopeHelper.cloneLocalScope();
        helper.command.tagIncludeUnmodified('2.0.0');
        helper.command.export();
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
      // @TODO: FIX ON HARMONY!
      describe.skip('bit show', () => {
        it('should throw an error suggesting to import the components', () => {
          const err = new ComponentsPendingImport();
          helper.general.expectToThrow(() => helper.command.showComponent('bar/foo'), err);
        });
      });
      // @TODO: FIX ON HARMONY!
      describe.skip('bit tag', () => {
        it('should throw an error suggesting to import the components', () => {
          const err = new ComponentsPendingImport();
          helper.general.expectToThrow(() => helper.command.tagAllWithoutBuild(), err);
        });
      });
    });
    // @TODO: FIX ON HARMONY!
    describe.skip('when the remote component does not exist or does not have this missing version', () => {
      let scopeAfterV1;
      let scopeOutOfSync;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
        helper.bitJsonc.setupDefault();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.fixtures.tagComponentBarFoo();
        helper.command.export();
        scopeAfterV1 = helper.scopeHelper.cloneLocalScope();
        helper.command.tagIncludeUnmodified('2.0.0');
        helper.command.export();
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
