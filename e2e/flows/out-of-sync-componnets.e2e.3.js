import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

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
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.deleteBitMap();
      helper.addComponentBarFoo();
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
  });
  describe('consumer with a new component and scope with the same component as exported', () => {
    let scopeOutOfSync;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.exportAllComponents();
      helper.deleteBitMap();
      helper.addComponentBarFoo();
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
});
