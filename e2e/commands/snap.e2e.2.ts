import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HASH_SIZE } from '../../src/constants';
import * as fixtures from '../../src/fixtures/fixtures';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { MergeConflictOnRemote } from '../../src/scope/exceptions';
import ComponentsPendingMerge from '../../src/consumer/component-ops/exceptions/components-pending-merge';
import { AUTO_SNAPPED_MSG } from '../../src/cli/commands/public-cmds/snap-cmd';

chai.use(require('chai-fs'));

describe('bit snap command', function () {
  this.timeout(0);
  const helper = new Helper();
  helper.command.setFeatures('lanes');
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
      expect(foo).to.have.property('head');
      expect(foo.head).to.be.a('string');
      expect(foo.head.length).to.equal(HASH_SIZE);
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.snapAllComponents();
    });
    it('should save the dependencies successfully with their snaps as versions', () => {
      const barFoo = helper.command.catComponent('bar/foo@latest');
      expect(barFoo.dependencies).to.have.lengthOf(1);
      expect(barFoo.dependencies[0].id.version).to.be.a('string').and.have.lengthOf(HASH_SIZE);
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
  describe('local and remote do not have the same head', () => {
    let scopeAfterFirstSnap: string;
    let firstSnap: string;
    let secondSnap: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapComponent('bar/foo');
      firstSnap = helper.command.getHead('bar/foo');
      helper.command.exportAllComponents();
      scopeAfterFirstSnap = helper.scopeHelper.cloneLocalScope();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapComponent('bar/foo');
      secondSnap = helper.command.getHead('bar/foo');
      helper.command.exportAllComponents();
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
          const remoteRefs = helper.general.getRemoteRefPath();
          expect(remoteRefs).to.be.a.file();
          const remoteRefContent = fs.readJsonSync(remoteRefs);
          expect(remoteRefContent).to.deep.include({
            id: { scope: helper.scopes.remote, name: 'bar/foo' },
            head: secondSnap,
          });
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
        const exportFunc = () => helper.command.exportAllComponents(); // v2 is exported again
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
            const bitMap = helper.bitMap.read();
            const head = helper.command.getHead('bar/foo');
            expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@${head}`);
            expect(bitMap).to.not.have.property(`${helper.scopes.remote}/bar/foo@${beforeMergeHead}`);
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
            const bitMap = helper.bitMap.read();
            expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@${beforeMergeHead}`);
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
              const bitMap = helper.bitMap.read();
              const head = helper.command.getHead('bar/foo');
              expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@${head}`);
              expect(bitMap).to.not.have.property(`${helper.scopes.remote}/bar/foo@${beforeMergeHead}`);
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
          const bitMap = helper.bitMap.read();
          const head = helper.command.getHead('bar/foo');
          expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@${head}`);
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
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@${localHead}`);
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
            const output = helper.general.runWithTryCatch('bit tag bar/foo');
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
            helper.command.removeComponent('bar/foo --silent -f');
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
            const bitMap = helper.bitMap.read();
            const head = helper.command.getHead('bar/foo');
            expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@${head}`);
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
            const bitMap = helper.bitMap.read();
            expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@${localHead}`);
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
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.snapAllComponents();
        firstSnap = helper.command.getHead('bar/foo');
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
        helper.command.snapAllComponents();
        secondSnap = helper.command.getHead('bar/foo');
        localScope = helper.scopeHelper.cloneLocalScope();
      });
      it('bit diff should show the differences', () => {
        const diff = helper.command.diff(` bar/foo ${firstSnap}`);
        const barFooFile = path.join('bar', 'foo.js');
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.snapAllComponents();

      helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2);

      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('components pending to be tagged automatically');

      snapOutput = helper.command.snapComponent('utils/is-type');
      isTypeHead = helper.command.getHead('utils/is-type');
    });
    it('should auto snap the dependencies and the nested dependencies', () => {
      expect(snapOutput).to.have.string(AUTO_SNAPPED_MSG);
    });
    it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', () => {
      const barFoo = helper.command.catComponent('utils/is-string@latest');
      expect(barFoo.dependencies[0].id.name).to.equal('utils/is-type');
      expect(barFoo.dependencies[0].id.version).to.equal(isTypeHead);

      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: isTypeHead });
    });
    it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
      const barFoo = helper.command.catComponent('bar/foo@latest');
      const isStringHead = helper.command.getHead('utils/is-string');
      expect(barFoo.dependencies[0].id.name).to.equal('utils/is-string');
      expect(barFoo.dependencies[0].id.version).to.equal(isStringHead);

      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: isTypeHead });
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-string', version: isStringHead });
    });
    it('bit-status should show them all as staged and not modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.be.empty;
      expect(status.stagedComponents).to.include('bar/foo');
      expect(status.stagedComponents).to.include('utils/is-string');
      expect(status.stagedComponents).to.include('utils/is-type');
    });
    describe('importing the component to another scope', () => {
      before(() => {
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
        const result = helper.command.runCmd('node app.js');
        // notice the "v2" (!)
        expect(result.trim()).to.equal('got is-type v2 and got is-string and got foo');
      });
    });
  });
});
