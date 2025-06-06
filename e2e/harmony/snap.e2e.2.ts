import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { HASH_SIZE, AUTO_SNAPPED_MSG, FILE_CHANGES_CHECKOUT_MSG } from '@teambit/legacy.constants';
import { ComponentsPendingMerge } from '@teambit/legacy.consumer';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';
import { MergeConflictOnRemote } from '@teambit/legacy.scope';

chai.use(require('chai-fs'));

describe('bit snap command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('snap before tag', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
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
      helper.bitMap.expectToHaveId('bar/foo', hash);
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
          helper.command.snapComponent('bar/foo', undefined, '--unmodified');
          secondTagOutput = helper.command.tagComponent('bar/foo', undefined, '--unmodified');
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponents();
    });
    it('should save the dependencies successfully with their snaps as versions', () => {
      const barFoo = helper.command.catComponent('comp1@latest');
      expect(barFoo.dependencies).to.have.lengthOf(1);
      expect(barFoo.dependencies[0].id.version).to.be.a('string').and.have.lengthOf(HASH_SIZE);
    });
    it('bit status should show them in the "snapped" section', () => {
      const status = helper.command.statusJson();
      expect(status.snappedComponents).to.have.lengthOf(3);
    });
    describe('tagging the components', () => {
      let scopeBeforeTag: string;
      before(() => {
        scopeBeforeTag = helper.scopeHelper.cloneWorkspace();
      });
      it('--all flag should include the snapped components', () => {
        const output = helper.command.tagAllWithoutBuild();
        expect(output).to.include('3 component(s) tagged');
      });
      it('--snapped flag should include the snapped components', () => {
        helper.scopeHelper.getClonedWorkspace(scopeBeforeTag);
        const output = helper.command.tagWithoutBuild(undefined, '--snapped');
        expect(output).to.include('3 component(s) tagged');
      });
    });
  });
  describe('untag a snap', () => {
    let firstSnap: string;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapComponent('bar/foo', undefined, '--unmodified');
      const compAfterSnap1 = helper.command.catComponent('bar/foo');
      firstSnap = compAfterSnap1.head;
      helper.command.snapComponent('bar/foo', undefined, '--unmodified');
    });
    describe('untag the head snap', () => {
      before(() => {
        helper.command.reset(`bar/foo`, true);
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
  });
  describe('local and remote do not have the same head', () => {
    let scopeAfterFirstSnap: string;
    let firstSnap: string;
    let secondSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapComponent('bar/foo');
      firstSnap = helper.command.getHead('bar/foo');
      helper.command.export();
      scopeAfterFirstSnap = helper.scopeHelper.cloneWorkspace();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapComponent('bar/foo');
      secondSnap = helper.command.getHead('bar/foo');
      helper.command.export();
    });
    describe('when the local is behind the remote', () => {
      describe('import only objects', () => {
        before(() => {
          helper.scopeHelper.getClonedWorkspace(scopeAfterFirstSnap);
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
          helper.bitMap.expectToHaveId('bar/foo', firstSnap, helper.scopes.remote);
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
          helper.scopeHelper.getClonedWorkspace(scopeAfterFirstSnap);
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
          helper.bitMap.expectToHaveId('bar/foo', secondSnap, helper.scopes.remote);
        });
        it('bit status should be clean', () => {
          helper.command.expectStatusToBeClean(['snappedComponents']);
        });
      });
    });
    describe('when the local is diverged from the remote', () => {
      // local has snapA => snapB. remote has snapA => snapC.
      let localHead;
      let localScope;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(scopeAfterFirstSnap);
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV3);
        helper.command.snapAllComponentsWithoutBuild();
        localHead = helper.command.getHead('bar/foo');
        localScope = helper.scopeHelper.cloneWorkspace();
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
          expect(status.modifiedComponents).to.have.lengthOf(0);
          expect(status.invalidComponents).to.have.lengthOf(0);
        });
      });
      describe('import without any flag', () => {
        before(() => {
          helper.scopeHelper.getClonedWorkspace(localScope);
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
          helper.scopeHelper.getClonedWorkspace(localScope);
          helper.command.importComponent('bar/foo --objects');
          beforeMergeScope = helper.scopeHelper.cloneWorkspace();
          beforeMergeHead = helper.command.getHead('bar/foo');
        });
        describe('without --no-snap flag', () => {
          let mergeOutput;
          before(() => {
            mergeOutput = helper.command.merge('bar/foo --auto-merge-resolve ours');
          });
          it('should succeed and indicate that the files were not changed', () => {
            expect(mergeOutput).to.not.have.string(FILE_CHANGES_CHECKOUT_MSG);
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
            expect(lastVersion.log.message).to.have.string(`merge ${helper.scopes.remote}/main`);
            expect(lastVersion.log.message).to.have.string('main');
          });
          it('should update bitmap snap', () => {
            const head = helper.command.getHead('bar/foo');
            helper.bitMap.expectToHaveId('bar/foo', head, helper.scopes.remote);
          });
        });
        describe('with --no-snap flag', () => {
          let mergeOutput;
          before(() => {
            helper.scopeHelper.getClonedWorkspace(beforeMergeScope);
            mergeOutput = helper.command.merge('bar/foo --auto-merge-resolve ours --no-snap');
          });
          it('should succeed and indicate that the files were not changed', () => {
            expect(mergeOutput).to.not.have.string(FILE_CHANGES_CHECKOUT_MSG);
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
            helper.bitMap.expectToHaveId('bar/foo', beforeMergeHead, helper.scopes.remote);
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
              expect(status.modifiedComponents).to.have.lengthOf(0);
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
              helper.bitMap.expectToHaveId('bar/foo', head, helper.scopes.remote);
            });
          });
        });
      });
      describe('merge with merge=theirs flag', () => {
        let mergeOutput;
        before(() => {
          helper.scopeHelper.getClonedWorkspace(localScope);
          helper.command.importComponent('bar/foo --objects');
          mergeOutput = helper.command.merge('bar/foo --auto-merge-resolve theirs');
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
          expect(lastVersion.log.message).to.have.string(`merge ${helper.scopes.remote}/main`);
          expect(lastVersion.log.message).to.have.string('main');
        });
        it('should update bitmap snap', () => {
          const head = helper.command.getHead('bar/foo');
          helper.bitMap.expectToHaveId('bar/foo', head, helper.scopes.remote);
        });
      });
      describe('merge with merge=manual flag', () => {
        let mergeOutput;
        let scopeWithConflicts;
        before(() => {
          helper.scopeHelper.getClonedWorkspace(localScope);
          helper.command.importComponent('bar/foo --objects');
          mergeOutput = helper.command.merge('bar/foo --manual');
          scopeWithConflicts = helper.scopeHelper.cloneWorkspace();
        });
        it('should succeed and indicate that the files were left in a conflict state', () => {
          expect(mergeOutput).to.have.string('CONFLICT');
        });
        it('should change the files on the filesystem and mark the conflicts properly', () => {
          const content = helper.fs.readFile('bar/foo.js');
          expect(content).to.have.string(`<<<<<<< ${localHead} (current)`);
          expect(content).to.have.string(fixtures.fooFixtureV3);
          expect(content).to.have.string('=======');
          expect(content).to.have.string(fixtures.fooFixtureV2);
          expect(content).to.have.string(`>>>>>>> ${secondSnap} (incoming)`);
        });
        it('should not change bitmap version', () => {
          helper.bitMap.expectToHaveId('bar/foo', localHead, helper.scopes.remote);
        });
        it('should not generate a new merge-snap', () => {
          const head = helper.command.getHead('bar/foo');
          expect(head).to.equal(localHead);
        });
        it('bit status should show it as component with conflict and modified but not as pending update', () => {
          const status = helper.command.statusJson();
          expect(status.componentsDuringMergeState).to.have.lengthOf(1);
          expect(status.modifiedComponents).to.have.lengthOf(1);
          expect(status.outdatedComponents).to.have.lengthOf(0);
          expect(status.mergePendingComponents).to.have.lengthOf(0);
        });
        it('should block checking out the component', () => {
          expect(() => helper.command.checkoutVersion(firstSnap, 'bar/foo', '--manual')).to.throw(
            'is in during-merge state'
          );
        });
        describe('tagging or snapping the component', () => {
          beforeEach(() => {
            helper.scopeHelper.getClonedWorkspace(scopeWithConflicts);
            // change the component to be valid, otherwise it has the conflicts marks and fail with
            // different errors
            helper.fixtures.createComponentBarFoo('');
          });
          it('should allow tagging the component successfully and add two parents to the Version object', () => {
            const output = helper.command.tagWithoutBuild('bar/foo');
            expect(output).to.have.string(`${helper.scopes.remote}/bar/foo@0.0.1`);

            const lastVersion = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
            expect(lastVersion.parents).to.have.lengthOf(2);
            expect(lastVersion.parents).to.include(secondSnap); // the remote head
            expect(lastVersion.parents).to.include(localHead);
          });
          it('should include the component when running bit tag --all', () => {
            const output = helper.command.tagAllWithoutBuild();
            expect(output).to.not.have.string('nothing to tag');

            const lastVersion = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
            expect(lastVersion.parents).to.have.lengthOf(2);
            expect(lastVersion.parents).to.include(secondSnap); // the remote head
            expect(lastVersion.parents).to.include(localHead);
          });
          it('should allow snapping the component successfully and add two parents to the Version object', () => {
            helper.command.snapComponentWithoutBuild('bar/foo');

            const lastVersion = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
            expect(lastVersion.parents).to.have.lengthOf(2);
            expect(lastVersion.parents).to.include(secondSnap); // the remote head
            expect(lastVersion.parents).to.include(localHead);
          });
        });
        describe('removing the component', () => {
          before(() => {
            helper.scopeHelper.getClonedWorkspace(scopeWithConflicts);
            helper.command.removeComponent('bar/foo -f');
          });
          it('bit status should not show the component', () => {
            const status = helper.command.status();
            expect(status).to.not.have.string('bar/foo');
          });
        });
        describe('un-tagging the component', () => {
          before(() => {
            helper.scopeHelper.getClonedWorkspace(scopeWithConflicts);
            // change it so the file would be valid without conflicts marks
            helper.fixtures.createComponentBarFoo('');
            helper.command.reset('bar/foo');
          });
          it('bit status should not show the component as a component with conflicts but as modified', () => {
            const status = helper.command.statusJson();
            expect(status.componentsDuringMergeState).to.have.lengthOf(0);
            expect(status.modifiedComponents).to.have.lengthOf(1);
            expect(status.mergePendingComponents).to.have.lengthOf(0);
            expect(status.stagedComponents).to.have.lengthOf(0);
          });
        });
        describe('resolving the merge', () => {
          let resolveOutput;
          before(() => {
            helper.scopeHelper.getClonedWorkspace(scopeWithConflicts);
            helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV3);
            resolveOutput = helper.command.merge('bar/foo --resolve');
          });
          it('should resolve the conflicts successfully', () => {
            expect(resolveOutput).to.have.string('successfully resolved component');
          });
          it('bit status should not show the component as if it has conflicts', () => {
            const status = helper.command.statusJson();
            expect(status.componentsDuringMergeState).to.have.lengthOf(0);
            expect(status.modifiedComponents).to.have.lengthOf(0);
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
            helper.bitMap.expectToHaveId('bar/foo', head, helper.scopes.remote);
          });
        });
        describe('aborting the merge', () => {
          let abortOutput;
          before(() => {
            helper.scopeHelper.getClonedWorkspace(scopeWithConflicts);
            abortOutput = helper.command.merge('bar/foo --abort');
          });
          it('should abort the merge successfully', () => {
            expect(abortOutput).to.have.string('successfully aborted the merge');
          });
          it('bit status should show the same state as before the merge', () => {
            const status = helper.command.statusJson();
            expect(status.mergePendingComponents).to.have.lengthOf(1);
            expect(status.componentsDuringMergeState).to.have.lengthOf(0);
            expect(status.modifiedComponents).to.have.lengthOf(0);
            expect(status.outdatedComponents).to.have.lengthOf(0);
            expect(status.stagedComponents).to.have.lengthOf(1);
          });
          it('should not change the version in .bitmap', () => {
            helper.bitMap.expectToHaveId('bar/foo', localHead, helper.scopes.remote);
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
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.snapAllComponents();
        firstSnap = helper.command.getHead('bar/foo');
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
        helper.command.snapAllComponents();
        secondSnap = helper.command.getHead('bar/foo');
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
        describe('bit checkout head', () => {
          it('should checkout to the latest (second) snap', () => {
            output = helper.command.checkoutHead('bar/foo');
            expect(output).to.have.string('successfully');
            expect(output).to.have.string(secondSnap);
            const content = helper.fs.readFile('bar/foo.js');
            expect(content).to.equal(fixtures.fooFixtureV2);
          });
        });
      });
    });
  });
  describe('auto snap', () => {
    let snapOutput;
    let isTypeHead;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponents();

      helper.fs.outputFile('comp3/index.js', fixtures.comp3V2);

      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('components pending auto-tag');

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

      expect(comp2.flattenedDependencies).to.deep.include({
        name: 'comp3',
        scope: helper.scopes.remote,
        version: isTypeHead,
      });
    });
    it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
      const comp1 = helper.command.catComponent('comp1@latest');
      const isStringHead = helper.command.getHead('comp2');
      expect(comp1.dependencies[0].id.name).to.equal('comp2');
      expect(comp1.dependencies[0].id.version).to.equal(isStringHead);

      expect(comp1.flattenedDependencies).to.deep.include({
        name: 'comp3',
        scope: helper.scopes.remote,
        version: isTypeHead,
      });
      expect(comp1.flattenedDependencies).to.deep.include({
        name: 'comp2',
        scope: helper.scopes.remote,
        version: isStringHead,
      });
    });
    it('bit-status should show them all as staged and not modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.be.empty;
      const staged = helper.command.getStagedIdsFromStatus();
      expect(staged).to.include('comp1');
      expect(staged).to.include('comp2');
      expect(staged).to.include('comp3');
    });
    describe('importing the component to another scope', () => {
      before(() => {
        helper.command.export();

        helper.scopeHelper.reInitWorkspace();
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
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1');
    });
    it('should not fetch previous version files for performance reasons, only the latest', () => {
      expect(() => helper.command.catComponent(`${helper.scopes.remote}/comp1@0.0.1`)).to.throw();
      // const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@0.0.1`);
      // const fileObj = comp1.files[0].file;
      // expect(() => helper.command.catObject(fileObj)).to.not.throw();
    });
  });
  describe('merge tags', () => {
    let authorFirstTag;
    let headBeforeDiverge;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      headBeforeDiverge = helper.command.getHead('comp1');
      authorFirstTag = helper.scopeHelper.cloneWorkspace();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(authorFirstTag);
      helper.fixtures.populateComponents(1, false, ' v3');
      helper.command.tagAllWithoutBuild('--ver 0.0.3');
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
    it('bit status should suggest running either "bit reset" or "bit merge"', () => {
      const output = helper.command.status();
      expect(output).to.have.string('bit reset');
      expect(output).to.have.string('bit merge');
    });
    describe('bit reset a diverge component', () => {
      let beforeUntag: string;
      let localHeadV3: string;
      before(() => {
        localHeadV3 = helper.command.getHead('comp1');
        helper.command.tagAllWithoutBuild('--ver 0.0.4 --unmodified');
        beforeUntag = helper.scopeHelper.cloneWorkspace();
      });
      describe('reset all local versions', () => {
        before(() => {
          helper.command.resetAll();
        });
        it('should change the head to point to the parent of the untagged version not to the remote head', () => {
          const head = helper.command.getHead('comp1');
          const remoteHead = helper.general.getRemoteHead('comp1');
          expect(head).to.not.be.equal(remoteHead);
          expect(head).to.be.equal(headBeforeDiverge);
        });
        it('bit status after untag should show the component not only as modified but also as outdated', () => {
          const status = helper.command.statusJson();
          expect(status.modifiedComponents).to.have.lengthOf(1);
          expect(status.outdatedComponents).to.have.lengthOf(1);
          helper.command.expectStatusToBeClean(['modifiedComponents', 'outdatedComponents']);
        });
      });
      describe('reset only head', () => {
        before(() => {
          helper.scopeHelper.getClonedWorkspace(beforeUntag);
          helper.command.resetAll('--head');
        });
        it('should change the head to point to the parent of the head and not to the remote head', () => {
          const head = helper.command.getHead('comp1');
          const remoteHead = helper.general.getRemoteHead('comp1');
          expect(head).to.not.be.equal(remoteHead);
          expect(head).to.be.equal(localHeadV3);
        });
      });
    });
  });
  describe('snap with --unmodified after soft-remove', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, undefined);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.deleteComponent('comp1');
      output = helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    it('should indicate that the component was removed successfully', () => {
      expect(output).to.have.string('removed components');
    });
    it('should not show the component as changed (because the new snap isnt relevant for a deleted component', () => {
      expect(output).to.not.have.string('changed components');
    });
  });
});
