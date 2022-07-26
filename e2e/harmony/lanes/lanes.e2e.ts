import chai, { expect } from 'chai';
import fs from 'fs-extra';
import { LANE_REMOTE_DELIMITER } from '@teambit/lane-id';
import path from 'path';
import { statusWorkspaceIsCleanMsg, AUTO_SNAPPED_MSG, IMPORT_PENDING_MSG } from '../../../src/constants';
import { LANE_KEY } from '../../../src/consumer/bit-map/bit-map';
import Helper from '../../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../../src/fixtures/fixtures';
import { removeChalkCharacters } from '../../../src/utils';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../../npm-ci-registry';

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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.command.createLane();
      output = helper.command.listLanes();
    });
    it('bit lane should show the active lane', () => {
      expect(output).to.have.string('current lane - dev');
      expect(output).to.have.string('main');
    });
  });
  describe('create a snap on main then on a new lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapAllComponentsWithoutBuild();
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
        expect(output).to.have.string('current lane - dev');
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
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
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
        helper.command.switchLocalLane('main');
        helper.command.createLane('stage');
        helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
        helper.command.snapAllComponents();
        diffOutput = helper.command.diffLane('main');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (stage)');
        expect(diffOutput).to.have.string('+++ foo.js (main)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo v2'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo'; }`);
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
        helper.command.createLane('int');
        diffOutput = helper.command.diffLane('stage');
      });
      it('should show the diff correctly', () => {
        expect(diffOutput).to.have.string('--- foo.js (int)');
        expect(diffOutput).to.have.string('+++ foo.js (stage)');

        expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
        expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
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
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
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
  describe('main => lane-a => lane-b, so laneB branched from laneA', () => {
    let beforeSwitchingBack;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      // main
      helper.fs.outputFile('utils/is-type/is-type.js', fixtures.isType);
      helper.command.addComponent('utils/is-type', { i: 'utils/is-type' });
      helper.command.snapAllComponents();

      // laneA
      helper.command.createLane('lane-a');
      helper.fs.outputFile(
        'utils/is-string/is-string.js',
        "const isType = require('../is-type/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };"
      );
      helper.command.addComponent('utils/is-string', { i: 'utils/is-string' });
      helper.command.linkAndRewire();
      helper.command.compile();
      helper.command.snapAllComponents();

      // laneB
      helper.command.createLane('lane-b');
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapAllComponents();

      beforeSwitchingBack = helper.scopeHelper.cloneLocalScope();
    });
    it('lane-a should not contain components from main', () => {
      const lane = helper.command.showOneLaneParsed('lane-a');
      expect(lane.components).to.have.lengthOf(1);
    });
    it('laneB object should include components from laneA, but not from main', () => {
      const lane = helper.command.showOneLaneParsed('lane-b');
      expect(lane.components).to.have.lengthOf(2);
    });
    it('bit list should show all components available to lane-b', () => {
      const list = helper.command.listLocalScopeParsed();
      expect(list).to.have.lengthOf(3);
    });
    describe('checking out to lane-a', () => {
      let switchOutput;
      before(() => {
        switchOutput = helper.command.switchLocalLane('lane-a');
      });
      it('should indicate that it switched to the new lane', () => {
        expect(switchOutput).to.have.string(
          removeChalkCharacters('successfully set "lane-a" as the active lane') as string
        );
      });
      // main components belong to lane-a only if they are snapped on lane-a, so utils/is-type
      // doesn't belong to lane-a and should not appear as staged when on lane-a.
      it('bit status should not show neither lane-b nor main components as staged', () => {
        const staged = helper.command.getStagedIdsFromStatus();
        expect(staged).to.deep.equal(['utils/is-string']);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
      });
      it('bit list should not show lane-b components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(2);
      });
      // @todo: test each one of the commands on bar/foo
    });
    describe('checking out from lane-b to main', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeSwitchingBack);
        helper.command.switchLocalLane('main');
      });
      it('bit list should only show main components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show only main components as staged', () => {
        const staged = helper.command.getStagedIdsFromStatus();
        expect(staged).to.deep.equal(['utils/is-type']);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
        expect(status).to.not.have.string('utils/is-string');
      });
    });
    describe('switching to lane-a then to main', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(beforeSwitchingBack);
        helper.command.switchLocalLane('lane-a');
        helper.command.switchLocalLane('main');
      });
      it('bit list should only show main components', () => {
        const list = helper.command.listParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show only main components as staged', () => {
        const staged = helper.command.getStagedIdsFromStatus();
        expect(staged).to.deep.equal(['utils/is-type']);
        const status = helper.command.status();
        expect(status).to.not.have.string('bar/foo');
        expect(status).to.not.have.string('utils/is-string');
      });
    });
  });
  describe('main => lane => main => lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const { scopePath, scopeName } = helper.scopeHelper.getNewBareScope();
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.createLane('dev');
      helper.command.changeLaneScope('dev', scopeName);
      helper.fs.outputFile('comp1/comp1.spec.js');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
    });
    it('bit import in a new workspace should not throw an error', () => {
      expect(() => helper.command.importComponent('comp1')).not.to.throw();
    });
  });
  describe('branching out when a component is checked out to an older version', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagWithoutBuild();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.tagWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo@0.0.1');

      helper.command.createLane();
      helper.fs.outputFile(`${helper.scopes.remote}/bar/foo/foo.js`, fixtures.fooFixtureV3);
      helper.command.snapAllComponentsWithoutBuild();

      helper.command.switchLocalLane('main');
    });
    it('should checkout to the head of the origin branch', () => {
      helper.bitMap.expectToHaveIdHarmony('bar/foo', '0.0.2');
    });
    it('bit status should be clean', () => {
      helper.command.expectStatusToBeClean();
    });
    // previously, the behavior was to checkout to the same version it had before
    it.skip('should checkout to the same version the origin branch had before the switch', () => {
      helper.bitMap.expectToHaveIdHarmony('bar/foo', '0.0.1');
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.addDefaultScope();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.createLane();
      helper.fixtures.populateComponents();
      helper.command.snapAllComponents();

      helper.fs.outputFile('comp3/index.js', `module.exports = () => 'comp3 v2';`);

      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('components pending to be tagged automatically');

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

        helper.scopeHelper.reInitLocalScopeHarmony();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(3);
      npmCiRegistry = new NpmCiRegistry(helper);
      npmCiRegistry.configureCiInPackageJsonHarmony();
      await npmCiRegistry.init();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitLocalScopeHarmony();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
          helper.command.mergeLane('dev', '--ours');
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
      helper.scopeHelper.reInitLocalScopeHarmony();
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
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.createLane();
      output = helper.command.changeLaneScope('dev', 'my-remote');
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
    let localScope: string;
    let remoteScope: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
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
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.scopeHelper.addRemoteScope();
        // previously, it was throwing an error while trying to fetch these two components, each from its own scope.
        helper.command.switchRemoteLane('dev');
      });
      // previous error was trying to get the Ref of the remote-scope according to the component-scope
      // resulting in zero data from the ref file and assuming all versions are staged
      it('should not show the component as staged', () => {
        helper.command.expectStatusToBeClean();
      });
    });
  });
  describe('multiple scopes when the components are new', () => {
    let anotherRemote: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
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
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.scopeHelper.addRemoteScope();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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

      helper.scopeHelper.reInitLocalScopeHarmony();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.setScope('non-exist-scope', 'comp1');
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
    });
    it('bit export should throw an error saying the scope does not exist', () => {
      expect(() => helper.command.export()).to.throw('cannot find scope');
    });
  });
  describe('snapping and un-tagging on a lane', () => {
    let afterFirstSnap: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
    });
  });
  describe('rename an exported lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.renameLane('dev', 'new-lane');
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
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
  });
});
