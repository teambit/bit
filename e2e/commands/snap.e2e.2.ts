import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { AUTO_SNAPPED_MSG } from '../../src/cli/commands/public-cmds/snap-cmd';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { HASH_SIZE } from '../../src/constants';
import ComponentsPendingMerge from '../../src/consumer/component-ops/exceptions/components-pending-merge';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import { MergeConflictOnRemote } from '../../src/scope/exceptions';

chai.use(require('chai-fs'));

describe('bit snap command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures([HARMONY_FEATURE]);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('snap before tag', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      output = helper.command.snapComponent('bar/foo');
    });
    it('should snap successfully', () => {
      expect(output).to.have.string('1 component(s) snapped');
    });
    it('should save the snap head in the component object', () => {
      const foo = helper.command.catComponent('bar/foo');
      expect(foo).to.have.property('head');
      expect(foo.head).to.be.a('string');
      expect(foo.head.length).to.equal(HASH_SIZE);
    });
    it('should save the snap hash as a version in .bitmap file', () => {
      const listScope = helper.command.listLocalScopeParsed();
      const hash = listScope[0].localVersion;
      helper.bitMap.expectToHaveIdHarmony('bar/foo', hash);
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
        expect(barFoo.head).to.equal(hash);
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
          expect(barFoo.head).to.equal(hash);
        });
      });
    });
  });
  describe('components with dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponents();
    });
    it('should save the dependencies successfully with their snaps as versions', () => {
      const barFoo = helper.command.catComponent('comp1@latest');
      expect(barFoo.dependencies).to.have.lengthOf(1);
      expect(barFoo.dependencies[0].id.version).to.be.a('string').and.have.lengthOf(HASH_SIZE);
    });
  });
  describe('untag a snap', () => {
    let firstSnap: string;
    let secondSnap: string;
    let beforeUntagScope: string;
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapComponent('bar/foo');
      const compAfterSnap1 = helper.command.catComponent('bar/foo');
      firstSnap = compAfterSnap1.head;
      helper.command.snapComponent('bar/foo -f');
      const compAfterSnap2 = helper.command.catComponent('bar/foo');
      secondSnap = compAfterSnap2.head;
      beforeUntagScope = helper.scopeHelper.cloneLocalScope();
    });
    describe('untag the head snap', () => {
      before(() => {
        helper.command.untag(`bar/foo ${secondSnap}`);
      });
      it('should change the head to the first snap', () => {
        const compAfterUntag = helper.command.catComponent('bar/foo');
        expect(compAfterUntag.head).to.equal(firstSnap);
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
        expect(compAfterUntag.head).to.equal(secondSnap);
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
  // these tests are failing on ssh. to make them work, run `bit config set features lanes` on the ssh machine first
  describe('local and remote do not have the same head', () => {
    let scopeAfterFirstSnap: string;
    let firstSnap: string;
    let secondSnap: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapComponent('bar/foo');
      firstSnap = helper.command.getHead('bar/foo');
      helper.command.export();
      scopeAfterFirstSnap = helper.scopeHelper.cloneLocalScope();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapComponent('bar/foo');
      secondSnap = helper.command.getHead('bar/foo');
      helper.command.export();
    });
    describe('when the local is behind the remote', () => {
      describe('import only objects', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeAfterFirstSnap);
          helper.command.importComponent('bar/foo --objects');
        });
        it('should write the head of the remote component', () => {
          const remoteRefs = helper.general.getRemoteRefPath();
          expect(remoteRefs).to.be.a.file();
          const remoteRefContent = fs.readJsonSync(remoteRefs);
          expect(remoteRefContent).to.deep.include({
            id: { scope: helper.scopes.remote, name: 'bar/foo' },
            head: secondSnap,
          });
        });
        it('should not change the version/snap in .bitmap', () => {
          helper.bitMap.expectToHaveIdHarmony('bar/foo', firstSnap, helper.scopes.remote);
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
          const remoteRefs = helper.general.getRemoteRefPath();
          expect(remoteRefs).to.be.a.file();
          const remoteRefContent = fs.readJsonSync(remoteRefs);
          expect(remoteRefContent).to.deep.include({
            id: { scope: helper.scopes.remote, name: 'bar/foo' },
            head: secondSnap,
          });
        });
        it('should change the version/snap in .bitmap', () => {
          helper.bitMap.expectToHaveIdHarmony('bar/foo', secondSnap, helper.scopes.remote);
        });
        it('bit status should be clean', () => {
          const status = helper.command.status();
          expect(status).to.have.string(statusWorkspaceIsCleanMsg);
        });
      });
    });
    describe('when the local is diverged from the remote', () => {
      // local has snapA => snapB. remote has snapA => snapC.
      let localHead;
      let localScope;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterFirstSnap);
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV3);
        helper.command.snapComponent('bar/foo');
        localHead = helper.command.getHead('bar/foo');
        localScope = helper.scopeHelper.cloneLocalScope();
      });
      it('should prevent exporting the component', () => {
        const exportFunc = () => helper.command.export(); // v2 is exported again
        const ids = [{ id: `${helper.scopes.remote}/bar/foo` }];
        const error = new MergeConflictOnRemote([], ids);
        helper.general.expectToThrow(exportFunc, error);
      });
      describe('importing with --object flag', () => {
        before(() => {
          helper.command.importComponent('bar/foo --objects');
        });
        it('should not change the head in the Component object', () => {
          const currentHead = helper.command.getHead('bar/foo');
          expect(localHead).to.equal(currentHead);
        });
        it('should write the head of the remote component', () => {
          const remoteRefs = helper.general.getRemoteRefPath();
          expect(remoteRefs).to.be.a.file();
          const remoteRefContent = fs.readJsonSync(remoteRefs);
          expect(remoteRefContent).to.deep.include({
            id: { scope: helper.scopes.remote, name: 'bar/foo' },
            head: secondSnap,
          });
        });
        it('bit status should show the component as pending merge', () => {
          const status = helper.command.statusJson();
          expect(status.mergePendingComponents).to.have.lengthOf(1);
          expect(status.outdatedComponents).to.have.lengthOf(0);
          expect(status.newComponents).to.have.lengthOf(0);
          expect(status.modifiedComponent).to.have.lengthOf(0);
          expect(status.invalidComponents).to.have.lengthOf(0);
        });
      });
      describe('import without any flag', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
        });
        it('should stop the process and throw a descriptive error suggesting to use --merge flag', () => {
          const func = () => helper.command.importComponent('bar/foo');
          const error = new ComponentsPendingMerge([
            { id: `${helper.scopes.remote}/bar/foo`, snapsLocal: 1, snapsRemote: 1 },
          ]);
          helper.general.expectToThrow(func, error);
        });
      });
      describe('merge with merge=ours flag', () => {
        let beforeMergeScope: string;
        let beforeMergeHead: string;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.command.importComponent('bar/foo --objects');
          beforeMergeScope = helper.scopeHelper.cloneLocalScope();
          beforeMergeHead = helper.command.getHead('bar/foo');
        });
        describe('without --no-snap flag', () => {
          let mergeOutput;
          before(() => {
            mergeOutput = helper.command.merge('bar/foo --ours');
          });
          it('should succeed and indicate that the files were not changed', () => {
            expect(mergeOutput).to.have.string('unchanged');
          });
          it('should indicate that a component was snapped', () => {
            expect(mergeOutput).to.have.string('merge-snapped components');
          });
          it('should not change the files on the filesystem', () => {
            const content = helper.fs.readFile('bar/foo.js');
            expect(content).to.equal(fixtures.fooFixtureV3);
          });
          it('should generate a snap-merge snap with two parents, the local and the remote', () => {
            const lastVersion = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
            expect(lastVersion.parents).to.have.lengthOf(2);
            expect(lastVersion.parents).to.include(secondSnap); // the remote head
            expect(lastVersion.parents).to.include(localHead);
          });
          it('should add a descriptive message about the merge', () => {
            const lastVersion = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
            expect(lastVersion.log.message).to.have.string('merge remote');
            expect(lastVersion.log.message).to.have.string('master');
          });
          it('should update bitmap snap', () => {
            const head = helper.command.getHead('bar/foo');
            helper.bitMap.expectToHaveIdHarmony('bar/foo', head, helper.scopes.remote);
          });
        });
        describe('with --no-snap flag', () => {
          let mergeOutput;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(beforeMergeScope);
            mergeOutput = helper.command.merge('bar/foo --ours --no-snap');
          });
          it('should succeed and indicate that the files were not changed', () => {
            expect(mergeOutput).to.have.string('unchanged');
          });
          it('should not show a message about merge-snapped components', () => {
            expect(mergeOutput).to.not.have.string('merge-snapped components');
          });
          it('should not change the files on the filesystem', () => {
            const content = helper.fs.readFile('bar/foo.js');
            expect(content).to.equal(fixtures.fooFixtureV3);
          });
          it('should not generate a snap-merge snap with two parents', () => {
            const lastVersion = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
            expect(lastVersion.parents).to.have.lengthOf(1);
          });
          it('should leave the components in a state of resolved but not snapped', () => {
            const status = helper.command.statusJson();
            expect(status.componentsDuringMergeState).to.have.lengthOf(1);
            expect(status.mergePendingComponents).to.have.lengthOf(0);
            expect(status.mergePendingComponents).to.have.lengthOf(0);
          });
          it('should not update bitmap', () => {
            helper.bitMap.expectToHaveIdHarmony('bar/foo', beforeMergeHead, helper.scopes.remote);
          });
          describe('generating merge-snap by merge --resolve flag', () => {
            let resolveOutput;
            before(() => {
              resolveOutput = helper.command.merge('bar/foo --resolve');
            });
            it('should resolve successfully', () => {
              expect(resolveOutput).to.have.string('successfully resolved component');
            });
            it('bit status should not show the component as during merge state', () => {
              const status = helper.command.statusJson();
              expect(status.componentsDuringMergeState).to.have.lengthOf(0);
              expect(status.modifiedComponent).to.have.lengthOf(0);
              expect(status.outdatedComponents).to.have.lengthOf(0);
              expect(status.mergePendingComponents).to.have.lengthOf(0);
              expect(status.stagedComponents).to.have.lengthOf(1);
            });
            it('should generate a snap-merge snap with two parents, the local and the remote', () => {
              const lastVersion = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
              expect(lastVersion.parents).to.have.lengthOf(2);
            });
            it('should update bitmap snap', () => {
              const head = helper.command.getHead('bar/foo');
              helper.bitMap.expectToHaveIdHarmony('bar/foo', head, helper.scopes.remote);
            });
          });
        });
      });
      describe('merge with merge=theirs flag', () => {
        let mergeOutput;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.command.importComponent('bar/foo --objects');
          mergeOutput = helper.command.merge('bar/foo --theirs');
        });
        it('should succeed and indicate that the files were updated', () => {
          expect(mergeOutput).to.have.string('updated');
        });
        it('should change the files on the filesystem according to the remote version', () => {
          const content = helper.fs.readFile('bar/foo.js');
          expect(content).to.equal(fixtures.fooFixtureV2);
        });
        it('should generate a snap-merge snap with two parents, the local and the remote', () => {
          const lastVersion = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
          expect(lastVersion.parents).to.have.lengthOf(2);
          expect(lastVersion.parents).to.include(secondSnap); // the remote head
          expect(lastVersion.parents).to.include(localHead);
        });
        it('should add a descriptive message about the merge', () => {
          const lastVersion = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
          expect(lastVersion.log.message).to.have.string('merge remote');
          expect(lastVersion.log.message).to.have.string('master');
        });
        it('should update bitmap snap', () => {
          const head = helper.command.getHead('bar/foo');
          helper.bitMap.expectToHaveIdHarmony('bar/foo', head, helper.scopes.remote);
        });
      });
      describe('merge with merge=manual flag', () => {
        let mergeOutput;
        let scopeWithConflicts;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.command.importComponent('bar/foo --objects');
          mergeOutput = helper.command.merge('bar/foo --manual');
          scopeWithConflicts = helper.scopeHelper.cloneLocalScope();
        });
        it('should succeed and indicate that the files were left in a conflict state', () => {
          expect(mergeOutput).to.have.string('CONFLICT');
        });
        it('should change the files on the filesystem and mark the conflicts properly', () => {
          const content = helper.fs.readFile('bar/foo.js');
          expect(content).to.have.string(`<<<<<<< ${secondSnap} (${helper.scopes.remote}/master)`);
          expect(content).to.have.string(fixtures.fooFixtureV2);
          expect(content).to.have.string('=======');
          expect(content).to.have.string(fixtures.fooFixtureV3);
          expect(content).to.have.string(`>>>>>>> ${localHead} (local)`);
        });
        it('should not change bitmap version', () => {
          helper.bitMap.expectToHaveIdHarmony('bar/foo', localHead, helper.scopes.remote);
        });
        it('should not generate a new merge-snap', () => {
          const head = helper.command.getHead('bar/foo');
          expect(head).to.equal(localHead);
        });
        it('bit status should show it as component with conflict and not as pending update or modified', () => {
          const status = helper.command.statusJson();
          expect(status.componentsDuringMergeState).to.have.lengthOf(1);
          expect(status.modifiedComponent).to.have.lengthOf(0);
          expect(status.outdatedComponents).to.have.lengthOf(0);
          expect(status.mergePendingComponents).to.have.lengthOf(0);
        });
        it('should block checking out the component', () => {
          const output = helper.command.checkoutVersion(firstSnap, 'bar/foo', '--manual');
          expect(output).to.have.string('has conflicts that need to be resolved first');
        });
        it('should block merging a different version into current version', () => {
          const output = helper.general.runWithTryCatch(`bit merge ${firstSnap} bar/foo --manual`);
          expect(output).to.have.string('has conflicts that need to be resolved first');
        });
        describe('tagging or snapping the component', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeWithConflicts);
            // change the component to be valid, otherwise it has the conflicts marks and fail with
            // different errors
            helper.fixtures.createComponentBarFoo('');
          });
          it('should block tagging the component', () => {
            const output = helper.general.runWithTryCatch('bit tag bar/foo --persist');
            expect(output).to.have.string('unable to snap/tag "bar/foo", it is unmerged with conflicts');
          });
          it('should not include the component when running bit tag --all', () => {
            const output = helper.general.runWithTryCatch('bit tag -a -f');
            expect(output).to.have.string('nothing to tag');
          });
          it('should block snapping the component', () => {
            const output = helper.general.runWithTryCatch('bit snap bar/foo');
            expect(output).to.have.string('unable to snap/tag "bar/foo", it is unmerged with conflicts');
          });
        });
        describe('removing the component', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeWithConflicts);
            helper.command.removeComponent('bar/foo -f');
          });
          it('bit status should not show the component', () => {
            const status = helper.command.status();
            expect(status).to.not.have.string('bar/foo');
          });
        });
        describe('un-tagging the component', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeWithConflicts);
            // change it so the file would be valid without conflicts marks
            helper.fixtures.createComponentBarFoo('');
            helper.command.untag('bar/foo');
          });
          it('bit status should not show the component as a component with conflicts but as outdated', () => {
            const status = helper.command.statusJson();
            expect(status.componentsDuringMergeState).to.have.lengthOf(0);
            expect(status.modifiedComponent).to.have.lengthOf(1);
            expect(status.outdatedComponents).to.have.lengthOf(1);
            expect(status.mergePendingComponents).to.have.lengthOf(0);
            expect(status.stagedComponents).to.have.lengthOf(0);
          });
        });
        describe('resolving the merge', () => {
          let resolveOutput;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeWithConflicts);
            helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV3);
            resolveOutput = helper.command.merge('bar/foo --resolve');
          });
          it('should resolve the conflicts successfully', () => {
            expect(resolveOutput).to.have.string('successfully resolved component');
          });
          it('bit status should not show the component as if it has conflicts', () => {
            const status = helper.command.statusJson();
            expect(status.componentsDuringMergeState).to.have.lengthOf(0);
            expect(status.modifiedComponent).to.have.lengthOf(0);
            expect(status.outdatedComponents).to.have.lengthOf(0);
            expect(status.mergePendingComponents).to.have.lengthOf(0);
            expect(status.stagedComponents).to.have.lengthOf(1);
          });
          it('should generate a snap-merge snap with two parents, the local and the remote', () => {
            const lastVersion = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
            expect(lastVersion.parents).to.have.lengthOf(2);
            expect(lastVersion.parents).to.include(secondSnap); // the remote head
            expect(lastVersion.parents).to.include(localHead);
          });
          it('should update bitmap snap', () => {
            const head = helper.command.getHead('bar/foo');
            helper.bitMap.expectToHaveIdHarmony('bar/foo', head, helper.scopes.remote);
          });
        });
        describe('aborting the merge', () => {
          let abortOutput;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeWithConflicts);
            abortOutput = helper.command.merge('bar/foo --abort');
          });
          it('should abort the merge successfully', () => {
            expect(abortOutput).to.have.string('successfully aborted the merge');
          });
          it('bit status should show the same state as before the merge', () => {
            const status = helper.command.statusJson();
            expect(status.mergePendingComponents).to.have.lengthOf(1);
            expect(status.componentsDuringMergeState).to.have.lengthOf(0);
            expect(status.modifiedComponent).to.have.lengthOf(0);
            expect(status.outdatedComponents).to.have.lengthOf(0);
            expect(status.stagedComponents).to.have.lengthOf(1);
          });
          it('should not change the version in .bitmap', () => {
            helper.bitMap.expectToHaveIdHarmony('bar/foo', localHead, helper.scopes.remote);
          });
          it('should reset the changes the merge done on the filesystem', () => {
            const content = helper.fs.readFile('bar/foo.js');
            expect(content).to.equal(fixtures.fooFixtureV3);
          });
        });
      });
    });
  });
  describe('bit checkout and bit diff for snaps', () => {
    describe('snap, change and then snap', () => {
      let firstSnap: string;
      let secondSnap: string;
      let localScope;
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFooAsDir();
        helper.command.snapAllComponents();
        firstSnap = helper.command.getHead('bar/foo');
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
        helper.command.snapAllComponents();
        secondSnap = helper.command.getHead('bar/foo');
        localScope = helper.scopeHelper.cloneLocalScope();
      });
      it('bit diff should show the differences', () => {
        const diff = helper.command.diff(` bar/foo ${firstSnap}`);
        const barFooFile = 'foo.js';
        expect(diff).to.have.string(`--- ${barFooFile} (${firstSnap})`);
        expect(diff).to.have.string(`+++ ${barFooFile} (${secondSnap})`);

        expect(diff).to.have.string("-module.exports = function foo() { return 'got foo'; }");
        expect(diff).to.have.string("+module.exports = function foo() { return 'got foo v2'; }");
      });
      describe('bit checkout', () => {
        let output;
        before(() => {
          output = helper.command.checkout(`${firstSnap} bar/foo`);
        });
        it('should checkout to the first snap', () => {
          expect(output).to.have.string('successfully');
          expect(output).to.have.string(firstSnap);
          const content = helper.fs.readFile('bar/foo.js');
          expect(content).to.equal(fixtures.fooFixture);
        });
        describe('bit checkout latest', () => {
          it('should checkout to the latest (second) snap', () => {
            output = helper.command.checkout('latest bar/foo');
            expect(output).to.have.string('successfully');
            expect(output).to.have.string(secondSnap);
            const content = helper.fs.readFile('bar/foo.js');
            expect(content).to.equal(fixtures.fooFixtureV2);
          });
        });
      });
      describe('bit merge', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          output = helper.command.mergeVersion(firstSnap, 'bar/foo', '--manual');
        });
        it('should merge successfully and leave the file in a conflict state', () => {
          expect(output).to.have.string('successfully');
          expect(output).to.have.string(firstSnap);
          expect(output).to.have.string('CONFLICT');

          const content = helper.fs.readFile('bar/foo.js');
          expect(content).to.have.string(`<<<<<<< ${secondSnap}`);
          expect(content).to.have.string(fixtures.fooFixtureV2);
          expect(content).to.have.string('=======');
          expect(content).to.have.string(fixtures.fooFixture);
          expect(content).to.have.string(`>>>>>>> ${firstSnap}`);
        });
      });
    });
  });
  describe('auto snap', () => {
    let snapOutput;
    let isTypeHead;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponents();

      helper.fs.outputFile('comp3/index.js', fixtures.comp3V2);

      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('components pending to be tagged automatically');

      snapOutput = helper.command.snapComponent('comp3');
      isTypeHead = helper.command.getHead('comp3');
    });
    it('should auto snap the dependencies and the nested dependencies', () => {
      expect(snapOutput).to.have.string(AUTO_SNAPPED_MSG);
    });
    it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', () => {
      const comp2 = helper.command.catComponent('comp2@latest');
      expect(comp2.dependencies[0].id.name).to.equal('comp3');
      expect(comp2.dependencies[0].id.version).to.equal(isTypeHead);

      expect(comp2.flattenedDependencies).to.deep.include({ name: 'comp3', version: isTypeHead });
    });
    it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
      const comp1 = helper.command.catComponent('comp1@latest');
      const isStringHead = helper.command.getHead('comp2');
      expect(comp1.dependencies[0].id.name).to.equal('comp2');
      expect(comp1.dependencies[0].id.version).to.equal(isStringHead);

      expect(comp1.flattenedDependencies).to.deep.include({ name: 'comp3', version: isTypeHead });
      expect(comp1.flattenedDependencies).to.deep.include({ name: 'comp2', version: isStringHead });
    });
    it('bit-status should show them all as staged and not modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.be.empty;
      expect(status.stagedComponents).to.include('comp1');
      expect(status.stagedComponents).to.include('comp2');
      expect(status.stagedComponents).to.include('comp3');
    });
    describe('importing the component to another scope', () => {
      before(() => {
        helper.command.export();

        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        // @todo: change to "helper.command.importComponent('comp1');". once the nested are working
        helper.command.importComponent('*');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        const compPath = `./${helper.scopes.remote}/comp1`;
        fs.outputFileSync(
          path.join(helper.scopes.localPath, 'app.js'),
          `const comp1 = require('${compPath}');\nconsole.log(comp1())`
        );
        const result = helper.command.runCmd('node app.js');
        // notice the "v2" (!)
        expect(result.trim()).to.equal('comp1 and comp2 and comp3 v2');
      });
    });
  });
  describe('tag after tag', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1');
    });
    it('should fetch previous version files', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@0.0.1`);
      const fileObj = comp1.files[0].file;
      expect(() => helper.command.catObject(fileObj)).to.not.throw();
    });
  });
  describe('merge tags', () => {
    let authorFirstTag;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      authorFirstTag = helper.scopeHelper.cloneLocalScope();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(authorFirstTag);
      helper.fixtures.populateComponents(1, undefined, ' v3');
      helper.command.tagAllWithoutBuild('-s 0.0.3');
      helper.command.importAllComponents();
    });
    it('should prevent exporting the component', () => {
      const exportFunc = () => helper.command.export();
      const ids = [{ id: `${helper.scopes.remote}/comp1` }];
      const error = new MergeConflictOnRemote([], ids);
      helper.general.expectToThrow(exportFunc, error);

      // also it should not delete versions.
      const compData = helper.command.catComponent('comp1');
      const firstTag = compData.versions['0.0.1'];
      expect(() => helper.command.catObject(firstTag)).to.not.throw();
    });
  });
});
