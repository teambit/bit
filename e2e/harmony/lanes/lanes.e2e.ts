import chai, { expect } from 'chai';
import fs from 'fs-extra';
import { LANE_REMOTE_DELIMITER } from '@teambit/lane-id';
import { InvalidScopeName } from '@teambit/legacy-bit-id';
import path from 'path';
import { AUTO_SNAPPED_MSG, IMPORT_PENDING_MSG } from '../../../src/constants';
import { LANE_KEY } from '../../../src/consumer/bit-map/bit-map';
import Helper from '../../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../../src/fixtures/fixtures';
import { removeChalkCharacters } from '../../../src/utils';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../../npm-ci-registry';
import { FetchMissingHistory } from '../../../src/scope/actions';

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
  describe('lane readme', () => {
    let laneWithoutReadme;
    let laneWithUnsnappedReadme;
    let laneWithSnappedReadme;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane();
      helper.fixtures.populateComponents(2);
      laneWithoutReadme = helper.scopeHelper.cloneLocalScope();
      helper.command.addLaneReadme('comp1', 'dev');
      laneWithUnsnappedReadme = helper.scopeHelper.cloneLocalScope();
      helper.command.snapAllComponentsWithoutBuild();
      laneWithSnappedReadme = helper.scopeHelper.cloneLocalScope();
    });
    it('bit lane readme-add [compId] [laneName] should allow adding unsnapped components', () => {
      helper.scopeHelper.getClonedLocalScope(laneWithUnsnappedReadme);
      const laneOutput = helper.command.catLane('dev');
      expect(laneOutput.readmeComponent.id.name).to.be.string('comp1');
    });
    it('bit lane readme-add [compId] [laneName] should allow adding snapped components', () => {
      helper.scopeHelper.getClonedLocalScope(laneWithSnappedReadme);
      const laneOutput = helper.command.catLane('dev');
      expect(laneOutput.readmeComponent.id.name).to.be.string('comp1');
    });
    it('bit lane readme-add [compId] should allow adding snapped components to the current lane', () => {
      helper.scopeHelper.getClonedLocalScope(laneWithoutReadme);
      const readmeOutput = helper.command.addLaneReadme('comp1');
      expect(readmeOutput).to.have.string('comp1 has been successfully added as the readme component for the lane dev');
    });
    it('bit lane readme-remove [laneName] should remove existing readme component', () => {
      helper.scopeHelper.getClonedLocalScope(laneWithUnsnappedReadme);
      const readmeOutput = helper.command.removeLaneReadme('dev');
      expect(readmeOutput).to.have.string('the readme component has been successfully removed from the lane dev');
    });
    it('bit lane readme-remove should remove existing readme component from the current lane', () => {
      helper.scopeHelper.getClonedLocalScope(laneWithSnappedReadme);
      const readmeOutput = helper.command.removeLaneReadme();
      expect(readmeOutput).to.have.string('the readme component has been successfully removed from the lane dev');
    });
    it('bit lane readme-remove should throw an error when there no readme component added to the lane', () => {
      const cmd = () => helper.command.removeLaneReadme();
      expect(cmd).to.throw();
    });
    it('bit lane should show the readme component', () => {
      helper.scopeHelper.getClonedLocalScope(laneWithSnappedReadme);
      const laneOutput = helper.command.catLane('dev');
      const output = helper.command.listLanes();
      expect(output).to.have.string(
        `readme component\n\t  ${laneOutput.readmeComponent.id.name} - ${laneOutput.readmeComponent.head}`
      );
    });
    it('bit list should show the readme component', () => {
      const listOutput = helper.command.listLocalScope();
      expect(listOutput).to.have.string(`[Lane Readme]: ${helper.scopeHelper.scopes.remote}/dev`);
    });
    it('should export component as lane readme ', () => {
      helper.command.exportLane();
      const output = helper.command.listRemoteLanesParsed();
      expect(output.lanes[0].readmeComponent.id.name).to.be.string('comp1');
    });
    it('bitmap should show the lane config for a readme component', () => {
      helper.scopeHelper.getClonedLocalScope(laneWithUnsnappedReadme);
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp1.config['teambit.lanes/lanes']).to.deep.equal({
        readme: { [`${helper.scopeHelper.scopes.remote}/dev`]: true },
      });
    });
    it('should not allow exporting a lane with unsnapped readme component', () => {
      helper.scopeHelper.getClonedLocalScope(laneWithUnsnappedReadme);
      helper.command.snapComponentWithoutBuild('comp2');
      expect(() => helper.command.exportLane()).throws();
    });
    describe('deleting the lane readme', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(laneWithSnappedReadme);
        helper.command.switchLocalLane('main');
      });
      it('should allow deleting the lane readme on a successful merge', () => {
        const cmd = () => helper.command.mergeLane('dev');
        expect(cmd).to.not.throw();
      });
      it('should delete the readme component on successful merge', () => {
        helper.scopeHelper.getClonedLocalScope(laneWithSnappedReadme);
        helper.command.switchLocalLane('main');
        const output = helper.command.mergeLane('dev');
        expect(output).to.have.string('removed components');
        expect(output).to.have.string('comp1');
      });
      it('should keep the readme component on successful merge when (--keep-readme) is set', () => {
        helper.scopeHelper.getClonedLocalScope(laneWithSnappedReadme);
        helper.command.switchLocalLane('main');
        const mergeOutput = helper.command.mergeLane('dev', '--keep-readme');
        expect(mergeOutput).to.not.have.string('removed components');
      });
    });
  });
  describe('creating a new lane without any component', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope({ addRemoteScopeAsDefaultScope: false });
      helper.command.createLane();
      output = helper.command.listLanes();
    });
    it('bit lane should show the active lane', () => {
      expect(output).to.have.string(`current lane - my-scope/dev`);
      expect(output).to.have.string('main');
    });
  });
  describe('create a snap on main then on a new lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit status should show the component only once as staged', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(1);
      expect(status.importPendingComponents).to.have.lengthOf(0);
      expect(status.invalidComponents).to.have.lengthOf(0);
      expect(status.modifiedComponents).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(0);
      expect(status.outdatedComponents).to.have.lengthOf(0);
    });
    it('bit log should show both snaps', () => {
      const log = helper.command.log('bar/foo');
      const mainSnap = helper.command.getHead('bar/foo');
      const devSnap = helper.command.getHeadOfLane('dev', 'bar/foo');
      expect(log).to.have.string(mainSnap);
      expect(log).to.have.string(devSnap);
    });
    it('bit log --parents should show the parents', () => {
      const log = helper.command.log('bar/foo', '--parents');
      const mainSnap = helper.command.getHeadShort('bar/foo');
      expect(log).to.have.string(`Parent(s): ${mainSnap}`);
    });
    describe('bit lane with --details flag', () => {
      let output: string;
      before(() => {
        output = helper.command.listLanes('--details');
      });
      it('should show all lanes and mark the current one', () => {
        expect(output).to.have.string(`current lane - ${helper.scopes.remote}/dev`);
      });
    });
    describe('exporting the lane', () => {
      before(() => {
        helper.command.exportLane();
      });
      it('should export components on that lane', () => {
        const list = helper.command.listRemoteScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show a clean state', () => {
        helper.command.expectStatusToBeClean();
      });
      it('should change .bitmap to have the remote lane', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[LANE_KEY].id).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
      });
      it('bit lane --remote should show the exported lane', () => {
        const remoteLanes = helper.command.listRemoteLanesParsed();
        expect(remoteLanes.lanes).to.have.lengthOf(1);
        expect(remoteLanes.lanes[0].name).to.equal('dev');
      });
      describe('bit lane diff on the scope', () => {
        let diffOutput: string;
        before(() => {
          diffOutput = helper.command.diffLane('dev', true);
        });
        it('should show the diff correctly', () => {
          expect(diffOutput).to.have.string('--- foo.js (main)');
          expect(diffOutput).to.have.string('+++ foo.js (dev)');

          expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
          expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
        });
      });
      describe('importing the component', () => {
        before(() => {
          helper.command.importComponent('bar/foo');
        });
        it('should not set the onLaneOnly to true as it exists also on main', () => {
          const bitmap = helper.bitMap.read();
          const bitmapEntry = bitmap['bar/foo'];
          expect(bitmapEntry).to.not.have.property('onLanesOnly');
        });
      });
    });
    describe('bit lane diff on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane();
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (main)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('bit lane diff {toLane - default} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('main');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (main)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('bit lane diff {toLane - non default} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        helper.command.switchLocalLane('main');
        helper.command.createLane('stage');
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV3);
        helper.command.snapAllComponents();

        diffOutput = helper.command.diffLane('dev');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (dev)');
        expect(diffOutput).to.have.string('+++ foo.js (stage)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo v2'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v3'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('bit lane diff {fromLane} {toLane} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('main dev');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (main)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
  });
  describe('tagging on a lane', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.createLane();
      helper.command.snapAllComponents();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      output = helper.general.runWithTryCatch('bit tag bar/foo');
    });
    it('should block the tag and suggest to switch to main and merge the changes', () => {
      expect(output).to.have.string(
        'unable to tag when checked out to a lane, please switch to main, merge the lane and then tag again'
      );
    });
  });

  describe('main => lane => main => lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.switchLocalLane('main');
    });
    // previously it errored with "error: version "latest" of component comp1 was not found."
    it('should be able to switch back to the lane with no error', () => {
      expect(() => helper.command.switchLocalLane('dev')).to.not.throw();
    });
  });
  describe('exporting a lane to a different scope than the component scope', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const { scopePath, scopeName } = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.createLane('dev');
      helper.command.changeLaneScope(scopeName);
      helper.fs.outputFile('comp1/comp1.spec.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    it('bit import in a new workspace should not throw an error', () => {
      expect(() => helper.command.importComponent('comp1')).not.to.throw();
    });
  });
  describe('branching out when a component is checked out to an older version', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagWithoutBuild();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo@0.0.1');

      helper.command.createLane();
      helper.fs.outputFile(`${helper.scopes.remote}/bar/foo/foo.js`, fixtures.fooFixtureV3);
      helper.command.snapAllComponentsWithoutBuild();

      helper.command.switchLocalLane('main');
    });
    it('should checkout to the head of the origin branch', () => {
      helper.bitMap.expectToHaveId('bar/foo', '0.0.2');
    });
    it('bit status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
    // previously, the behavior was to checkout to the same version it had before
    it.skip('should checkout to the same version the origin branch had before the switch', () => {
      helper.bitMap.expectToHaveId('bar/foo', '0.0.1');
    });
    // previously, the behavior was to checkout to the same version it had before
    it.skip('bit status should not show the component as modified only as pending update', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
      expect(status.outdatedComponents).to.have.lengthOf(1);
      expect(status.importPendingComponents).to.have.lengthOf(0);
      expect(status.stagedComponents).to.have.lengthOf(0);
      expect(status.invalidComponents).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(0);
    });
  });
  // this makes sure that when exporting lanes, it only exports the local snaps.
  // in this test, the second snap is done on a clean scope without the objects of the first snap.
  describe('snap on lane, export, clear project, snap and export', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes({ disablePreview: false });
      // Do not add "disablePreview()" here. It's important to generate the preview here.
      // this is the file that exists on the first snap but not on the second.
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponents();
      helper.command.exportLane();
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.import();
      helper.fixtures.populateComponents(1, undefined, ' v2');
      helper.bitJsonc.disablePreview();
      helper.command.snapAllComponents();
    });
    it('should export with no errors about missing artifact files from the first snap', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });
  describe('auto-snap when on a lane', () => {
    let snapOutput;
    let comp3Head;
    let comp2Head;
    let comp1Head;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponents();

      helper.fs.outputFile('comp3/index.js', `module.exports = () => 'comp3 v2';`);

      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('components pending auto-tag (when their modified dependencies are tagged)');

      snapOutput = helper.command.snapComponent('comp3');
      comp3Head = helper.command.getHeadOfLane('dev', 'comp3');
      comp2Head = helper.command.getHeadOfLane('dev', 'comp2');
      comp1Head = helper.command.getHeadOfLane('dev', 'comp1');
    });
    it('should auto snap the dependencies and the nested dependencies', () => {
      expect(snapOutput).to.have.string(AUTO_SNAPPED_MSG);
    });
    it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', () => {
      const isString = helper.command.catComponent(`comp2@${comp2Head}`);
      expect(isString.dependencies[0].id.name).to.equal('comp3');
      expect(isString.dependencies[0].id.version).to.equal(comp3Head);

      expect(isString.flattenedDependencies).to.deep.include({ name: 'comp3', version: comp3Head });
    });
    it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
      const barFoo = helper.command.catComponent(`comp1@${comp1Head}`);
      expect(barFoo.dependencies[0].id.name).to.equal('comp2');
      expect(barFoo.dependencies[0].id.version).to.equal(comp2Head);

      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'comp3', version: comp3Head });
      expect(barFoo.flattenedDependencies).to.deep.include({ name: 'comp2', version: comp2Head });
    });
    it('bit-status should show them all as staged and not modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.be.empty;
      const staged = helper.command.getStagedIdsFromStatus();
      expect(staged).to.include('comp1');
      expect(staged).to.include('comp2');
      expect(staged).to.include('comp3');
    });
    // @todo
    describe.skip('importing the component to another scope', () => {
      before(() => {
        helper.command.export();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('comp1');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintComp1(helper.scopes.remote));
        const result = helper.command.runCmd('node app.js');
        // notice the "v2" (!)
        expect(result.trim()).to.equal('got is-type v2 and got is-string and got foo');
      });
    });
  });
  (supportNpmCiRegistryTesting ? describe : describe.skip)('import with dependencies as packages', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      npmCiRegistry.setResolver();
      helper.command.importComponent('comp1');
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('switching to a new lane', () => {
      before(() => {
        helper.command.createLane();
      });
      it('should not show all components are staged', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });
  describe('tag on main, export, create lane and snap', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit status should show the correct staged versions', () => {
      // before it was a bug that "versions" part of the staged-component was empty
      // another bug was that it had all versions included exported.
      const status = helper.command.status('--verbose');
      const hash = helper.command.getHeadOfLane('dev', 'comp1');
      expect(status).to.have.string(`versions: ${hash} ...`);
    });
    describe('export the lane, then switch back to main', () => {
      let afterSwitchingLocal: string;
      let afterSwitchingRemote: string;
      before(() => {
        helper.command.exportLane();
        helper.command.switchLocalLane('main');
        afterSwitchingLocal = helper.scopeHelper.cloneLocalScope();
        afterSwitchingRemote = helper.scopeHelper.cloneRemoteScope();
      });
      it('status should not show the components as pending updates', () => {
        helper.command.expectStatusToBeClean();
      });
      describe('switch the lane back to dev', () => {
        before(() => {
          helper.command.switchLocalLane('dev');
        });
        it('should change the version prop in .bitmap', () => {
          const bitMap = helper.bitMap.read();
          const head = helper.command.getHeadOfLane('dev', 'comp1');
          expect(bitMap.comp1.version).to.equal(head);
        });
        describe('switch back to main', () => {
          before(() => {
            helper.command.switchLocalLane('main');
          });
          it('should change the version prop in .bitmap', () => {
            const bitMap = helper.bitMap.read();
            expect(bitMap.comp1.version).to.equal('0.0.1');
          });
          it('status should not show the components as pending updates', () => {
            helper.command.expectStatusToBeClean();
          });
        });
      });
      describe('merging the dev lane when the lane is ahead (no diverge)', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(afterSwitchingLocal);
          helper.command.mergeLane('dev');
        });
        it('should merge the lane', () => {
          const mergedLanes = helper.command.listLanes('--merged');
          expect(mergedLanes).to.include('dev');
        });
        it('should show the merged components as staged', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
        });
        it('bit import should not reset the component to the remote-state but should keep the merged data', () => {
          helper.command.import();
          const status = helper.command.statusJson();
          expect(status.outdatedComponents).to.have.lengthOf(0);
          expect(status.stagedComponents).to.have.lengthOf(2);
        });
        describe('tagging the components', () => {
          before(() => {
            helper.command.tagIncludeUnmodified();
          });
          it('should be able to export with no errors', () => {
            expect(() => helper.command.export()).not.to.throw();
          });
        });
      });
      describe('merging the dev lane when the lane has diverged from main', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(afterSwitchingLocal);
          helper.scopeHelper.getClonedRemoteScope(afterSwitchingRemote);
          helper.fixtures.populateComponents(2, undefined, 'v3');
          helper.command.snapAllComponentsWithoutBuild();
          helper.command.mergeLane('dev', '--auto-merge-resolve ours --no-squash');
        });
        it('should merge the lane', () => {
          const mergedLanes = helper.command.listLanes('--merged');
          expect(mergedLanes).to.include('dev');
        });
        it('should show the merged components as staged', () => {
          const status = helper.command.statusJson();
          expect(status.stagedComponents).to.have.lengthOf(2);
        });
        describe('tagging the components', () => {
          before(() => {
            helper.command.tagIncludeUnmodified();
          });
          it('should be able to export with no errors', () => {
            expect(() => helper.command.export()).not.to.throw();
          });
        });
      });
    });
  });
  describe('untag on a lane', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      output = helper.command.untagAll();
    });
    it('should untag successfully', () => {
      expect(output).to.have.string('1 component(s) were untagged');
    });
    it('should change the component to be new', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
  });
  describe('default tracking data', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.createLane();
    });
    it('should set the remote-scope to the default-scope and remote-name to the local-lane', () => {
      const laneData = helper.command.showOneLane('dev');
      expect(laneData).to.have.string(`${helper.scopes.remote}${LANE_REMOTE_DELIMITER}dev`);
    });
  });
  describe('change tracking data', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.createLane();
      output = helper.command.changeLaneScope('my-remote');
    });
    it('should output the changes', () => {
      expect(removeChalkCharacters(output)).to.have.string(
        `the remote-scope of dev has been changed from ${helper.scopes.remote} to my-remote`
      );
    });
    it('bit lane show should show the changed values', () => {
      const laneData = helper.command.showOneLane('dev');
      expect(laneData).to.have.string(`my-remote${LANE_REMOTE_DELIMITER}dev`);
    });
  });
  describe('multiple scopes', () => {
    let anotherRemote: string;
    let anotherRemotePath: string;
    let localScope: string;
    let remoteScope: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      anotherRemotePath = scopePath;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fs.outputFile('bar1/foo1.js', 'console.log("v1");');
      helper.fs.outputFile('bar2/foo2.js', 'console.log("v1");');
      helper.command.addComponent('bar1');
      helper.command.addComponent('bar2');
      helper.bitJsonc.addToVariant('bar2', 'defaultScope', anotherRemote);
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.command.createLane();
      helper.fs.outputFile('bar1/foo1.js', 'console.log("v2");');
      helper.fs.outputFile('bar2/foo2.js', 'console.log("v2");');
      helper.command.snapAllComponents();

      localScope = helper.scopeHelper.cloneLocalScope();
      remoteScope = helper.scopeHelper.cloneRemoteScope();
    });
    // previously, it was showing an error about missing versions.
    describe('exporting the lane to the remote', () => {
      it('should not throw an error', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
      // previously, it would remove the staged-config only when the component-scope was the same as the lane-scope or when the comp is new
      it('should remove the content of the staged-config', () => {
        const stagedConfig = helper.general.getStagedConfig(`${helper.scopes.remote}/dev`);
        expect(stagedConfig).to.have.lengthOf(0);
      });
      // previously, it was changing the scope-name of bar2 to the first remote.
      it('the components scope should not be changed on the remote', () => {
        const catRemote = helper.command.catScope(false, helper.scopes.remotePath);
        const bar2 = catRemote.find((c) => c.name === 'bar2');
        expect(bar2.scope).to.equal(anotherRemote);
      });
    });
    describe('when artifacts from older versions are missing locally', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        // delete an artifact
        const artifacts = helper.command.getArtifacts(`${anotherRemote}/bar2@0.0.1`);
        const pkgArtifacts = artifacts.find((a) => a.generatedBy === 'teambit.pkg/pkg');
        const artifactFileHash = pkgArtifacts.files[0].file;
        const hashPath = helper.general.getHashPathOfObject(artifactFileHash);
        helper.fs.deleteObject(hashPath);
      });
      // previously, throwing an error "unable to find an artifact object file".
      it('should not throw an error', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
    });
    describe('importing the lane', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        helper.command.export();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addRemoteScope(anotherRemotePath); // needed to fetch the head from the original scope.
        // previously, it was throwing an error while trying to fetch these two components, each from its own scope.
        helper.command.switchRemoteLane('dev');
      });
      // previous error was trying to get the Ref of the remote-scope according to the component-scope
      // resulting in zero data from the ref file and assuming all versions are staged
      it('should not show the component as staged', () => {
        helper.command.expectStatusToBeClean();
      });
    });
    describe('merging from scope', () => {
      let afterExport: string;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(localScope);
        helper.scopeHelper.getClonedRemoteScope(remoteScope);
        helper.command.export();
        afterExport = helper.scopeHelper.cloneLocalScope();
        const bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
        helper.scopeHelper.addRemoteScope(anotherRemotePath, bareMerge.scopePath);
        helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`, '--push');
      });
      it('should push the artifacts to the original-scope', () => {
        const artifacts = helper.command.getArtifacts(`${anotherRemote}/bar2@latest`, anotherRemotePath);
        const pkgArtifacts = artifacts.find((a) => a.generatedBy === 'teambit.pkg/pkg');
        const hash = pkgArtifacts.files[0].file;
        expect(() => helper.command.catObject(hash, false, anotherRemotePath)).to.not.throw();
      });
      describe('tagging from scope', () => {
        before(() => {
          const bareTag = helper.scopeHelper.getNewBareScope('-bare-tag');
          helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);
          helper.scopeHelper.addRemoteScope(anotherRemotePath, bareTag.scopePath);
          const data = [
            {
              componentId: `${helper.scopes.remote}/bar1`,
            },
            {
              componentId: `${anotherRemote}/bar2`,
            },
          ];
          helper.command.tagFromScope(bareTag.scopePath, data, '--push');
        });
        describe('merging main into the lane', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(afterExport);
            helper.command.mergeLane('main', '-x');
            helper.command.export();
            helper.scopeHelper.getClonedLocalScope(afterExport);
            helper.command.switchLocalLane('main', '-x');
            helper.command.import();
            helper.command.mergeLane('dev');
          });
          it('should merge successfully without throwing errors about missing objects', () => {
            expect(() => helper.command.mergeLane('dev')).to.not.throw();
          });
        });
      });
    });
  });
  describe('multiple scopes when the components are new', () => {
    let anotherRemote: string;
    let anotherRemotePath: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      anotherRemotePath = scopePath;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.fs.outputFile('bar1/index.js', 'const bar2 = require("../bar2"); console.log(bar2);');
      helper.fs.outputFile('bar2/index.js', 'console.log("v1");');
      helper.command.add('bar1');
      helper.command.add('bar2', `--scope ${anotherRemote}`);
      helper.command.linkAndRewire();

      helper.command.compile();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
    });
    describe('exporting the lane to the remote', () => {
      before(() => {
        helper.command.export();
      });
      // previously, it was changing the scope-name of bar2 to the first remote.
      it('should not change the scope of the components in .bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.bar2.scope).to.equal(anotherRemote);
      });
      // previously, it was changing the scope-name of bar2 to the first remote.
      it('should not change the scope-name in the lane object', () => {
        const lane = helper.command.catLane('dev');
        const bar2 = lane.components.find((c) => c.id.name === 'bar2');
        expect(bar2.id.scope).to.equal(anotherRemote);
      });
      it('should symlink in the object to the correct scope', () => {
        const obj = helper.command.catObject('033c4846b506a4a48e32cdf54515c91d3499adb3', true);
        expect(obj.realScope).to.equal(anotherRemote);
      });
      describe('importing the lane', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.scopeHelper.addRemoteScope(anotherRemotePath); // needed to fetch the head from the original scope.
          helper.command.switchRemoteLane('dev');
        });
        it('should not show the component as staged', () => {
          helper.command.expectStatusToBeClean();
        });
      });
    });
  });
  describe('multiple scopes when main is ahead', () => {
    let anotherRemote: string;
    let localScope: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fs.outputFile('bar1/foo1.js', 'console.log("v1");');
      helper.fs.outputFile('bar2/foo2.js', 'console.log("v1");');
      helper.command.addComponent('bar1');
      helper.command.addComponent('bar2');
      helper.command.setScope(anotherRemote, 'bar2');
      helper.command.compile();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      localScope = helper.scopeHelper.cloneLocalScope();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.import(`${scopeName}/bar2`);
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(localScope);
      helper.command.import();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    // previously, it used to error with "error: version "0.0.2" of component jozc1y79-remote2/bar2 was not found."
    it('should be able to export', () => {
      expect(() => helper.command.export()).to.not.throw();
      // import used to throw as well
      expect(() => helper.command.import()).to.not.throw();
    });
  });
  describe('multiple scopes when a component in the origin is different than on the lane', () => {
    let anotherRemote: string;
    let beforeExport: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(1);
      helper.command.setScope(anotherRemote, 'comp1');
      beforeExport = helper.scopeHelper.cloneLocalScope();

      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(beforeExport);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit export should throw an error', () => {
      expect(() => helper.command.export()).to.throw('unable to export a lane with a new component "comp1"');
    });
  });
  describe('multiple scopes when a scope of the component does not exist', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.setScope('non-exist-scope', 'comp1');
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit export should throw an error saying the scope does not exist', () => {
      expect(() => helper.command.export()).to.throw('cannot find scope');
    });
  });
  describe('multiple scopes when the origin-scope exits but does not have the component. only lane-scope has it', () => {
    let anotherRemote: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(1);
      helper.command.setScope(anotherRemote, 'comp1');
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
    });
    // should not throw an error "the component {component-name} has no versions and the head is empty."
    it('bit import should not throw an error', () => {
      expect(() => helper.command.import()).to.not.throw();
    });
  });
  describe('multiple scopes - using FetchMissingHistory action', () => {
    let anotherRemote: string;
    const getFirstTagFromRemote = () =>
      helper.command.catComponent(`${anotherRemote}/comp1@0.0.1`, helper.scopes.remotePath);
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(1);
      helper.command.setScope(anotherRemote, 'comp1');
      helper.command.tagAllWithoutBuild();
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      // currently, the objects from remote2 are in remote. so simulate a case where it's missing.
      const firstTagHash = helper.command.catComponent('comp1').versions['0.0.1'];
      const objectPath = helper.general.getHashPathOfObject(firstTagHash);
      helper.fs.deleteRemoteObject(objectPath);

      // an intermediate step. make sure the object is missing.
      expect(getFirstTagFromRemote).to.throw();

      helper.command.runAction(FetchMissingHistory.name, helper.scopes.remote, { ids: [`${anotherRemote}/comp1`] });
    });
    it('the remote should have the history of a component from the other remote', () => {
      expect(getFirstTagFromRemote).to.not.throw();
    });
  });
  describe('multiple scopes - lane-scope does not have main tags', () => {
    let anotherRemote: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(1, false);
      helper.command.setScope(scopeName, 'comp1');
      helper.command.tagAllWithoutBuild();
      // snap multiple times on main. these snaps will be missing locally during the snap-from-scope
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.import(`${anotherRemote}/comp1`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    it('bit status should show only the last snap of the imported component as staged', () => {
      const status = helper.command.statusJson();
      status.stagedComponents.forEach((comp) => {
        expect(comp.versions).to.have.lengthOf(1);
      });
    });
    it('bit export should not throw an error', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });
  describe('multiple scopes - fork the lane and export to another scope', () => {
    let anotherRemote: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(2);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.createLane('lane-b', `--scope ${anotherRemote} --fork-lane-new-scope`);
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      // previously, it was errored here because the remote didn't have comp2, so it couldn't merge the lane.
      helper.command.export('--fork-lane-new-scope');
    });
    it('should be able to import the forked lane with no errors', () => {
      expect(() => helper.command.import(`${anotherRemote}/lane-b`)).to.not.throw();
    });
  });
  // eventually, this forked lane history is not connected to main.
  // lane-a continue snapping and then merged+squashed into main.
  // on main the "squash" prop points to a newer version from lane-a, which doesn't exist on lane-b.
  // on lane-b, getDivergeData compares its head to main, not to lane-a because they're different scopes.
  // as a result, although it traverses the "squash", it's unable to connect main to lane-b.
  // the missing history exists on lane-a only.

  // update: after PR: https://github.com/teambit/bit/pull/7822, the version-history is created during
  // export. as a result, the VersionHistory the client gets, has already the entire graph, with all the
  // connections.
  describe('multiple scopes - fork the lane, then original lane progresses and squashed to main', () => {
    let anotherRemote: string;
    let laneB: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, scopePath);
      helper.fixtures.populateComponents(2);
      helper.command.createLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.createLane('lane-b', `--scope ${anotherRemote} --fork-lane-new-scope`);
      laneB = helper.scopeHelper.cloneLocalScope();
      helper.command.switchLocalLane('lane-a', '-x');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('lane-a', '-x');
      helper.command.export();
      helper.scopeHelper.getClonedLocalScope(laneB);
      helper.command.import();
    });
    it('should not throw NoCommonSnap on bit status', () => {
      expect(() => helper.command.status()).not.to.throw();
    });
    // see the update in the `describe` section.
    it.skip('should show the component in the invalid component section', () => {
      const status = helper.command.statusJson();
      expect(status.invalidComponents).lengthOf(2);
      expect(status.invalidComponents[0].error.name).to.equal('NoCommonSnap');
    });
    it('should be able to export with no error', () => {
      expect(() => helper.command.export('--fork-lane-new-scope')).to.not.throw();
    });
  });
  describe('snapping and un-tagging on a lane', () => {
    let afterFirstSnap: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      afterFirstSnap = helper.scopeHelper.cloneLocalScope();
      helper.command.untagAll();
    });
    it('bit lane show should not show the component as belong to the lane anymore', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components).to.have.lengthOf(0);
    });
    // a previous bug kept the WorkspaceLane object as is with the previous, untagged version
    it('bit list should not show the currentVersion as the untagged version', () => {
      const list = helper.command.listParsed();
      expect(list[0].currentVersion).to.equal('N/A');
    });
    describe('switching to main', () => {
      before(() => {
        helper.command.switchLocalLane('main');
      });
      it('bit status should show the component as new', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(1);
      });
    });
    describe('add another snap and then untag only the last snap', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterFirstSnap);
        helper.command.snapComponentWithoutBuild('comp1', '--force');
        helper.command.untag('comp1', true);
      });
      it('should not show the component as new', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(0);
        expect(status.stagedComponents).to.have.lengthOf(1);
      });
    });
    describe('un-snap by specifying the component name', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterFirstSnap);
      });
      // a previous bug was showing "unable to untag comp1, the component is not staged" error.
      it('should not throw an error', () => {
        expect(() => helper.command.untag('comp1')).to.not.throw();
      });
    });
  });
  describe('bit checkout to a previous snap', () => {
    let firstSnap: string;
    let secondSnap: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      firstSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapComponentWithoutBuild('comp1');
      secondSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.checkoutVersion(firstSnap, 'comp1');
    });
    it('should not show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(0);
    });
    it('bit list should show the scope-version as latest and workspace-version as the checked out one', () => {
      const list = helper.command.listParsed();
      const comp1 = list[0];
      expect(comp1.currentVersion).to.equal(firstSnap);
      expect(comp1.localVersion).to.equal(secondSnap);
    });
  });
  describe('update components from remote lane', () => {
    let afterFirstExport: string;
    let remoteAfterSecondExport: string;
    let beforeSecondExport: string;
    let remoteBeforeSecondExport: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      afterFirstExport = helper.scopeHelper.cloneLocalScope();
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      beforeSecondExport = helper.scopeHelper.cloneLocalScope();
      remoteBeforeSecondExport = helper.scopeHelper.cloneRemoteScope();
      helper.command.export();
      remoteAfterSecondExport = helper.scopeHelper.cloneRemoteScope();
    });
    describe('running "bit import" when the local is behind', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterFirstExport);
        helper.command.import();
      });
      it('bit import should not only bring the components but also merge the lane object', () => {
        const headOnLocalLane = helper.command.getHeadOfLane('dev', 'comp1');
        const headOnRemoteLane = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(headOnLocalLane).to.equal(headOnRemoteLane);
      });
      it('bit status should show the components as pending-updates', () => {
        const status = helper.command.statusJson();
        expect(status.outdatedComponents).to.have.lengthOf(1);
      });
      it('bit checkout head --all should update them all to the head version', () => {
        helper.command.checkoutHead('--all');
        helper.command.expectStatusToBeClean();
      });
    });
    describe('running "bit import" when the remote is behind', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeSecondExport);
        helper.scopeHelper.getClonedRemoteScope(remoteBeforeSecondExport);
        helper.command.import();
      });
      it('bit import should not change the heads with the older snaps', () => {
        const headOnLocalLane = helper.command.getHeadOfLane('dev', 'comp1');
        const headOnRemoteLane = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(headOnLocalLane).to.not.equal(headOnRemoteLane);
      });
      it('bit status should still show the components as staged', () => {
        const status = helper.command.statusJson();
        expect(status.stagedComponents).to.have.lengthOf(1);
      });
    });
    describe('running "bit import" when the remote and the local have diverged', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(afterFirstExport);
        // it's imported, otherwise the auto-import brings the second snap from the remote
        helper.scopeHelper.getClonedRemoteScope(remoteBeforeSecondExport);
        helper.fixtures.populateComponents(1, undefined, 'v3');
        helper.command.snapAllComponentsWithoutBuild();
        helper.scopeHelper.getClonedRemoteScope(remoteAfterSecondExport);
        helper.command.import();
      });
      it('bit import should not change the heads with the older snaps', () => {
        const headOnLocalLane = helper.command.getHeadOfLane('dev', 'comp1');
        const headOnRemoteLane = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(headOnLocalLane).to.not.equal(headOnRemoteLane);
      });
      it('bit status should show the components as pending-merge', () => {
        const status = helper.command.statusJson();
        expect(status.mergePendingComponents).to.have.lengthOf(1);
      });
      it('bit merge with no args should merge them', () => {
        const output = helper.command.merge(`--auto-merge-resolve manual`);
        expect(output).to.have.string('successfully merged');
        expect(output).to.have.string('CONFLICT');
      });
    });
  });
  describe('rename an exported lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.renameLane('new-lane');
    });
    it('should rename the lane locally', () => {
      const lanes = helper.command.listLanes();
      expect(lanes).to.have.string('new-lane');
      expect(lanes).to.not.have.string('dev');
    });
    it('should change the current lane', () => {
      const lanes = helper.command.listLanesParsed();
      expect(lanes.currentLane).to.equal('new-lane');
    });
    it('should change the remote lane name as well', () => {
      const remoteLanes = helper.command.listRemoteLanesParsed();
      expect(remoteLanes.lanes).to.have.lengthOf(1);
      expect(remoteLanes.lanes[0].name).to.equal('new-lane');
    });
  });
  describe('export on main then on a lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      // simulate cloning the project and coping scope.json to be checked out to the lane
      const scopeJson = helper.scopeJson.read();
      helper.fs.deletePath('.bit');
      helper.command.init();
      helper.scopeJson.write(scopeJson);

      helper.command.import();
    });
    it('bit status should not complain about outdated objects', () => {
      const status = helper.command.status();
      expect(status).to.not.have.string(IMPORT_PENDING_MSG);
    });
  });
  describe('deleting the local scope after exporting a lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.exportLane();
      helper.fs.deletePath('.bit');
      helper.scopeHelper.addRemoteScope();
    });
    it('should re-create scope.json with checkout to the lane specified in the .bitmap file', () => {
      helper.command.expectCurrentLaneToBe('dev');
    });
    // previously, it used to throw "component X has no versions and the head is empty"
    it('bit import should not throw an error', () => {
      expect(() => helper.command.import()).to.not.throw();
    });
  });
  describe('lane-a => lane-b', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(2, undefined, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
    });
    // previously, it was showing the components as staged, because it was comparing them to head, instead of
    // comparing them to lane-a.
    it('bit status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
    describe('lane-a (exported) => lane-b (not-exported) => lane-c', () => {
      before(() => {
        helper.command.createLane('lane-c');
      });
      it('forkedFrom should be of lane-a and not lane-b because this is the last exported one', () => {
        const lane = helper.command.catLane('lane-c');
        expect(lane.forkedFrom.name).to.equal('lane-a');
      });
    });
    describe('switching back to lane-a', () => {
      before(() => {
        helper.command.switchLocalLane('lane-a');
      });
      it('bitmap should show the lane as exported', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap[LANE_KEY].exported).to.be.true;
      });
    });
  });
  describe('head on the lane is not in the filesystem', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.fs.deletePath('.bit');
      helper.scopeHelper.addRemoteScope();
    });
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).not.to.throw();
    });
  });
  describe('export when previous versions have deleted dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild();
      helper.command.export();
      helper.command.removeComponentFromRemote(`${helper.scopes.remote}/comp3`, '--force');
      helper.command.removeComponent('comp3', '--force');
      helper.fs.outputFile('comp2/index.js', ''); // remove the dependency from the code
      helper.command.tagWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    it('should not throw ComponentNotFound on export', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });
  describe('some components are on a lane some are not', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild('comp3');
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    it('bit list should not show components from the lanes', () => {
      const list = helper.command.listRemoteScopeParsed();
      expect(list).to.have.lengthOf(1);
    });
    it('bit import should not throw', () => {
      expect(() => helper.command.importComponent('*')).to.not.throw();
    });
  });
  describe('export on lane with tiny cache', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.runCmd('bit config set cache.max.objects 1');
    });
    after(() => {
      helper.command.runCmd('bit config del cache.max.objects');
    });
    // previously, it was throwing "HeadNotFound"/"ComponentNotFound" when there were many objects in the cache
    it('should not throw', () => {
      expect(() => helper.command.export()).not.to.throw();
    });
  });
  describe('export multiple snaps on lane when the remote has it already', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      // the second snap is mandatory, don't skip it.
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    // previously, it was throwing ParentNotFound
    it('bit export should not throw ParentNotFound', () => {
      expect(() => helper.command.export()).not.to.throw();
    });
  });
  describe('getting new components from the lane', () => {
    let firstWorkspaceAfterExport: string;
    let secondWorkspace: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const firstWorkspace = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev');
      secondWorkspace = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.getClonedLocalScope(firstWorkspace);
      helper.fixtures.populateComponents(2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      firstWorkspaceAfterExport = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.getClonedLocalScope(secondWorkspace);
    });
    it('bit checkout with --workspace-only flag should not add the component and should suggest omitting --workspace-only flag', () => {
      const output = helper.command.checkoutHead('--skip-dependency-installation --workspace-only');
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
      expect(output).to.have.string('omit --workspace-only flag to add them');
    });
    it('bit checkout without --workspace-only flag should add the new components', () => {
      helper.command.checkoutHead('--skip-dependency-installation');
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(2);
    });
    describe('when the new component is soft-removed', () => {
      let beforeCheckout: string;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(firstWorkspaceAfterExport);
        helper.command.softRemoveOnLane('comp2');
        helper.fs.writeFile('comp1/index.js', ''); // remove the comp2 dependency from the code
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
        helper.scopeHelper.getClonedLocalScope(secondWorkspace);
        helper.command.import();
        beforeCheckout = helper.scopeHelper.cloneLocalScope();
      });
      it('bit checkout with --workspace-only flag, should not suggest omitting it', () => {
        const output = helper.command.checkoutHead('--skip-dependency-installation');
        expect(output).to.not.have.string('omit --workspace-only flag to add them');
        expect(output).to.not.have.string('comp2');
      });
      it('bit checkout head should not add it', () => {
        helper.scopeHelper.getClonedLocalScope(beforeCheckout);
        helper.command.checkoutHead('--skip-dependency-installation');
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
      });
    });
  });
  // lane-b was forked from lane-a.
  // remotely, lane-b has snapA, and lane-a has snapA + snapX1 + snapX2.
  // locally, lane-a was merged into lane-b, as a result, lane-b has snapA + snapX1 + snapX2.
  // from lane-b perspective, snapX1 and snapX2 are staged. from the remote perspective, they both exist, so no need to
  // export them.
  describe('exporting a component on a lane when the staged snaps exist already on the remote (from another lane)', function () {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild(); // snapA
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.command.export();
      const laneAFirstSnap = helper.scopeHelper.cloneLocalScope();
      helper.command.switchLocalLane('lane-a');
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // snapX1
      helper.command.snapAllComponentsWithoutBuild('--unmodified'); // snapX2
      helper.command.export();

      // locally
      helper.scopeHelper.getClonedLocalScope(laneAFirstSnap);
      helper.command.mergeLane('lane-a'); // now lane-b has snapA + snapB + snapX1 (from lane-a) + snapX2 (the from lane-a)
      helper.command.import();
      // keep this to fetch from all lanes, because in the future, by default, only the current lane is fetched
      helper.command.fetchAllLanes();
    });
    after(() => {
      helper.scopeHelper.destroy();
    });
    it('bit export should not throw', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });
  describe('change-scope', () => {
    describe('when the lane is exported', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.command.createLane();
        helper.fixtures.populateComponents(1, false);
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
      });
      it('should block the rename', () => {
        expect(() => helper.command.changeLaneScope('new-scope')).to.throw(
          'changing lane scope-name is allowed for new lanes only'
        );
      });
    });
    describe('when the scope-name is invalid', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.command.createLane();
        helper.fixtures.populateComponents(1, false);
      });
      it('should throw InvalidScopeName error', () => {
        const err = new InvalidScopeName('invalid.scope.name');
        const cmd = () => helper.command.changeLaneScope('invalid.scope.name');
        helper.general.expectToThrow(cmd, err);
      });
    });
  });
  describe('checking out to a different version from main', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild(); // 0.0.1
      helper.command.tagAllWithoutBuild('--unmodified'); // 0.0.2
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.importComponent('comp1@0.0.1', '--save-in-lane'); // now the lane has it as 0.0.1
      helper.command.export();

      helper.command.checkoutVersion('0.0.2', 'comp1', '-x');

      // deleting the local scope
      helper.command.init('--reset-scope');

      helper.command.import();
    });
    it('bit import should bring the version in the bitmap', () => {
      expect(() => helper.command.catComponent(`${helper.scopes.remote}/comp1@0.0.2`)).to.not.throw();
    });
    it('bit status should not throw ComponentsPendingImport', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
  });
  describe('create comp on a lane then same on main', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.fetchLane(`${helper.scopes.remote}/dev`);
    });
    // previously, it was throwing "getHeadRegardlessOfLaneAsTagOrHash() failed finding a head for lyq5piak-remote/comp1"
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).to.not.throw();
    });
  });
  describe('import from one lane to another directly', () => {
    let headOnLaneB: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(1, false, 'from-lane-b');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      helper.command.switchLocalLane('lane-a', '-x');
      helper.fixtures.populateComponents(1, false, 'from-lane-a');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
    });
    it('should block the import', () => {
      expect(() => helper.command.importComponent(`comp1@${headOnLaneB}`)).to.throw(
        `unable to import the following component(s) as they belong to other lane(s)`
      );
    });
  });
  describe('import from a lane to main', () => {
    let headOnLaneA: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    it('should block the import', () => {
      expect(() => helper.command.importComponent(`comp1@${headOnLaneA}`)).to.throw(
        `unable to import the following component(s) as they belong to other lane(s)`
      );
    });
  });
  describe('import from one lane to another directly when current lane does not have the component', () => {
    let headOnLaneA: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
    });
    it('should block the import', () => {
      expect(() => helper.command.importComponent(`comp1@${headOnLaneA}`)).to.throw(
        `unable to import the following component(s) as they belong to other lane(s)`
      );
    });
  });
  describe('import from one lane to another directly when current lane does have the component', () => {
    let headOnLaneA: string;
    let headOnLaneB: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const laneAWs = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('lane-b');
      helper.command.mergeLane(`${helper.scopes.remote}/lane-a`, '-x');
      helper.command.export();
      headOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      const laneBWs = helper.scopeHelper.cloneLocalScope();
      helper.scopeHelper.getClonedLocalScope(laneAWs);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp1');
      helper.scopeHelper.getClonedLocalScope(laneBWs);
    });
    // previously, it was quietly importing the component from the current lane and ignores the provided version.
    it('should not bring that snap', () => {
      const output = helper.command.importComponent(`comp1@${headOnLaneA}`, '--override');
      expect(output).to.have.string('Missing Components');
    });
    it('should not not change .bitmap', () => {
      const bitMap = helper.bitMap.read();
      const bitMapVer = bitMap.comp1.version;
      expect(bitMapVer).to.equal(headOnLaneB);
    });
  });
  describe('creating a new lane to a different scope than main', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
    });
    it('should not throw even when --fork-lane-new-scope was not used', () => {
      expect(() => helper.command.createLane('dev', '--scope some-scope')).to.not.throw();
    });
  });
  describe('creating components on lanes, that do not exist on main', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('should add "onLanesOnly" prop', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp1.onLanesOnly).to.be.true;
    });
  });
});
