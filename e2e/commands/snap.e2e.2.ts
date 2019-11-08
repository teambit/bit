import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HASH_SIZE, BIT_HIDDEN_DIR, REMOTE_REFS_DIR } from '../../src/constants';
import * as fixtures from '../fixtures/fixtures';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { MergeConflictOnRemote } from '../../src/scope/exceptions';

chai.use(require('chai-fs'));

describe('bit snap command', function() {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('snap before tag', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      output = helper.command.snapComponent('bar/foo');
    });
    it('should snap successfully', () => {
      expect(output).to.have.string('1 component(s) snapped');
    });
    it('should save the snap head in the component object', () => {
      const foo = helper.command.catComponent('bar/foo');
      expect(foo).to.have.property('snaps');
      expect(foo.snaps).to.have.property('head');
      expect(foo.snaps.head).to.be.a('string');
      expect(foo.snaps.head.length).to.equal(HASH_SIZE);
    });
    it('should save the snap hash as a version in .bitmap file', () => {
      const listScope = helper.command.listLocalScopeParsed();
      const hash = listScope[0].localVersion;
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`bar/foo@${hash}`);
    });
    it('bit status should show the snap as staged', () => {
      const status = helper.command.status();
      expect(status).to.have.string('staged components');
    });
    describe('then tag', () => {
      let tagOutput: string;
      before(() => {
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
        tagOutput = helper.command.tagAllComponents();
      });
      it('should tag successfully', () => {
        expect(tagOutput).to.have.string('1 component(s) tagged');
      });
      it('should change the snap head to the newly created version', () => {
        const barFoo = helper.command.catComponent('bar/foo');
        const hash = barFoo.versions['0.0.1'];
        expect(barFoo.snaps.head).to.equal(hash);
      });
      describe('then snap and tag again', () => {
        let secondTagOutput;
        before(() => {
          helper.command.snapComponent('bar/foo -f');
          secondTagOutput = helper.command.tagComponent('bar/foo -f');
        });
        it('should tag the next version', () => {
          expect(secondTagOutput).to.have.string('0.0.2');
        });
        it('should change the snap head to the newly created version', () => {
          const barFoo = helper.command.catComponent('bar/foo');
          const hash = barFoo.versions['0.0.2'];
          expect(barFoo.snaps.head).to.equal(hash);
        });
      });
    });
  });
  describe('components with dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.snapAllComponents();
    });
    it('should save the dependencies successfully with their snaps as versions', () => {
      const barFoo = helper.command.catComponent('bar/foo@latest');
      expect(barFoo.dependencies).to.have.lengthOf(1);
      expect(barFoo.dependencies[0].id.version)
        .to.be.a('string')
        .and.have.lengthOf(HASH_SIZE);
    });
  });
  describe('untag a snap', () => {
    let firstSnap: string;
    let secondSnap: string;
    let beforeUntagScope: string;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapComponent('bar/foo');
      const compAfterSnap1 = helper.command.catComponent('bar/foo');
      firstSnap = compAfterSnap1.snaps.head;
      helper.command.snapComponent('bar/foo -f');
      const compAfterSnap2 = helper.command.catComponent('bar/foo');
      secondSnap = compAfterSnap2.snaps.head;
      beforeUntagScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('untag the head snap', () => {
      before(() => {
        helper.command.untag(`bar/foo ${secondSnap}`);
      });
      it('should change the head to the first snap', () => {
        const compAfterUntag = helper.command.catComponent('bar/foo');
        expect(compAfterUntag.snaps.head).to.equal(firstSnap);
      });
      it('should remove the snap from the state.versions array', () => {
        const compAfterUntag = helper.command.catComponent('bar/foo');
        expect(Object.keys(compAfterUntag.state.versions)).to.have.lengthOf(1);
      });
    });
    describe('untag the first snap', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeUntagScope);

        // an intermediate step, make sure the parents of the second snap has the first snap
        const barFoo = helper.command.catComponent('bar/foo@latest');
        expect(barFoo.parents).to.have.lengthOf(1);
        expect(barFoo.parents[0]).to.equal(firstSnap);

        helper.command.untag(`bar/foo ${firstSnap}`);
      });
      it('should not change the head', () => {
        const compAfterUntag = helper.command.catComponent('bar/foo');
        expect(compAfterUntag.snaps.head).to.equal(secondSnap);
      });
      it('should remove the snap from the state.versions array', () => {
        const compAfterUntag = helper.command.catComponent('bar/foo');
        expect(Object.keys(compAfterUntag.state.versions)).to.have.lengthOf(1);
      });
      it('should remove the first snap from the parents of the second snap', () => {
        const barFoo = helper.command.catComponent('bar/foo@latest');
        expect(barFoo.parents).to.have.lengthOf(0);
      });
    });
  });
  describe('local and remote do not have the same head', () => {
    let scopeAfterFirstSnap: string;
    let firstSnap: string;
    let secondSnap: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapComponent('bar/foo');
      firstSnap = helper.command.getSnapHead('bar/foo');
      helper.command.exportAllComponents();
      scopeAfterFirstSnap = helper.scopeHelper.cloneLocalScope();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapComponent('bar/foo');
      secondSnap = helper.command.getSnapHead('bar/foo');
      helper.command.exportAllComponents();
    });
    describe('when the local is behind the remote', () => {
      describe('import only objects', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterFirstSnap);
          helper.command.importComponent('bar/foo --objects');
        });
        it('should write the head of the remote component', () => {
          const remoteRefs = path.join(helper.scopes.localPath, BIT_HIDDEN_DIR, REMOTE_REFS_DIR, helper.scopes.remote);
          expect(remoteRefs).to.be.a.file();
          const remoteRefContent = fs.readJsonSync(remoteRefs);
          expect(remoteRefContent).to.deep.include({ name: 'bar/foo', head: secondSnap });
        });
        it('should not change the version/snap in .bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@${firstSnap}`);
          expect(bitMap).to.not.have.property(`${helper.scopes.remote}/bar/foo@${secondSnap}`);
        });
        it('bit status should show pending updates', () => {
          const status = helper.command.status();
          expect(status).to.have.string('pending updates');
          expect(status).to.have.string(firstSnap);
          expect(status).to.have.string(secondSnap);
        });
      });
      describe('import (and merge)', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterFirstSnap);
          helper.command.importComponent('bar/foo');
        });
        it('should write the head of the remote component', () => {
          const remoteRefs = path.join(helper.scopes.localPath, BIT_HIDDEN_DIR, REMOTE_REFS_DIR, helper.scopes.remote);
          expect(remoteRefs).to.be.a.file();
          const remoteRefContent = fs.readJsonSync(remoteRefs);
          expect(remoteRefContent).to.deep.include({ name: 'bar/foo', head: secondSnap });
        });
        it('should change the version/snap in .bitmap', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).not.to.have.property(`${helper.scopes.remote}/bar/foo@${firstSnap}`);
          expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@${secondSnap}`);
        });
        it('bit status should be clean', () => {
          const status = helper.command.status();
          expect(status).to.have.string(statusWorkspaceIsCleanMsg);
        });
      });
    });
    describe('when the local is diverged from the remote', () => {
      // local has snapA => snapB. remote has snapA => snapC.
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterFirstSnap);
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV3);
        helper.command.snapComponent('bar/foo');
        helper.command.getSnapHead('bar/foo');
      });
      it('should prevent exporting the component', () => {
        const exportFunc = () => helper.command.exportAllComponents(); // v2 is exported again
        const ids = [`${helper.scopes.remote}/bar/foo`];
        const error = new MergeConflictOnRemote([], ids);
        helper.general.expectToThrow(exportFunc, error);
      });
    });
  });
});
