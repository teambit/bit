import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('merge lanes - main lane operations', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('merging main into local lane', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      mergeOutput = helper.command.mergeLane('main');
    });
    it("should not throw an error that main lane doesn't exist", () => {
      expect(mergeOutput).to.not.have.string('unable to switch to "main", the lane was not found');
    });
  });

  describe('merge main into a lane when it is locally deleted on the lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('dev');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('dev');
      helper.command.softRemoveOnLane('comp1');
    });
    it('should show a descriptive error explaining why it cannot be merged', () => {
      const cmd = () => helper.command.mergeLane('main', '-x');
      expect(cmd).to.throw('component is locally deleted');
    });
  });

  describe('merging main into local lane when main has tagged versions', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(1, undefined, 'version2');
      helper.command.snapAllComponentsWithoutBuild();
      mergeOutput = helper.command.mergeLane('main');
    });
    it("should not throw an error that main lane doesn't exist", () => {
      expect(mergeOutput).to.not.have.string('getDivergeData: unable to find Version 0.0.1 of comp1');
    });
  });

  describe('merging main when on lane and some workspace components belong to the lane, some belong to main', () => {
    let laneWs: string;
    let headComp1OnLane: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev');
      // add only comp1 to the lane
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();
      headComp1OnLane = helper.command.getHeadOfLane('dev', 'comp1');
      laneWs = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(2, undefined, 'version2');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    describe('without --exclude-non-lane-comps flag', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(laneWs);
        helper.command.mergeLane('main', '-x');
      });
      it('should not add non-lane components into the lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(1);
      });
      it('should update comp1 on the lane because it is part of the lane', () => {
        const head = helper.command.getHeadOfLane('dev', 'comp1');
        expect(head).to.not.equal(headComp1OnLane);
      });
      it('should update non-lane components in the .bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp2.version).to.equal('0.0.2');
      });
      it('should update the component files in the filesystem for all of them', () => {
        const comp1 = helper.fs.readFile('comp1/index.js');
        expect(comp1).to.have.string('version2');
        const comp2 = helper.fs.readFile('comp2/index.js');
        expect(comp2).to.have.string('version2');
      });
    });
    describe('with --exclude-non-lane-comps flag', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(laneWs);
        helper.command.mergeLane('main', '--exclude-non-lane-comps -x');
      });
      it('should not add non-lane components into the lane', () => {
        const lane = helper.command.showOneLaneParsed('dev');
        expect(lane.components).to.have.lengthOf(1);
      });
      it('should update comp1 on the lane because it is part of the lane', () => {
        const head = helper.command.getHeadOfLane('dev', 'comp1');
        expect(head).to.not.equal(headComp1OnLane);
      });
      it('should not update non-lane components in the .bitmap', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap.comp2.version).to.equal('0.0.1');
      });
      it('should update the component files only for lane components', () => {
        const comp1 = helper.fs.readFile('comp1/index.js');
        expect(comp1).to.have.string('version2');
        const comp2 = helper.fs.readFile('comp2/index.js');
        expect(comp2).to.not.have.string('version2');
      });
    });
  });

  describe('merging main lane with no snapped components', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane('dev');
      mergeOutput = helper.command.mergeLane('main');
    });
    it('should not throw an error about missing objects', () => {
      expect(mergeOutput).to.not.have.string(
        'component comp1 is on the lane but its objects were not found, please re-import the lane'
      );
    });
  });

  describe('merging a lane into main when main is empty', () => {
    let mergeOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.switchLocalLane('main');
      mergeOutput = helper.command.mergeLane('dev');
    });
    it('should not throw an error that head is empty', () => {
      expect(mergeOutput).to.have.string('successfully merged');
    });
    it('the component should be available on main', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
    });
  });

  describe('merge main to lane when they are diverged with dependencies update (auto) after deleted deps-set', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.dependenciesSet('comp1', 'lodash@^4.17.21');
      helper.npm.addFakeNpmPackage('lodash', '4.17.21');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();

      helper.command.switchLocalLane('main', '-x');
      helper.command.dependenciesUnset('comp1', 'lodash');
      helper.command.tagAllWithoutBuild('--unmodified -m "second tag on main"');
      helper.command.export();

      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLaneWithoutBuild('main', '-x --ignore-config-changes');
    });
    it('should remove the dependency that was unset in main from the config.policy', () => {
      const comp1HeadOnLane = helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`);
      const obj = helper.command.catComponent(`comp1@${comp1HeadOnLane}`);
      const depsResolver = obj.extensions.find((e) => e.name === 'teambit.dependencies/dependency-resolver');
      const configPolicy = depsResolver.config.policy;
      expect(configPolicy).to.not.have.property('dependencies');
    });
    it('should update the dependencies according to main', () => {
      const comp1HeadOnLane = helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`);
      const obj = helper.command.catComponent(`comp1@${comp1HeadOnLane}`);
      expect(obj.dependencies[0].id.name).to.equal('comp2');
      expect(obj.dependencies[0].id.version).to.equal('0.0.2');
      expect(obj.flattenedDependencies[0].version).to.equal('0.0.2');
      const depsResolver = obj.extensions.find((e) => e.name === 'teambit.dependencies/dependency-resolver');
      const comp2 = depsResolver.data.dependencies.find((d) => d.id.includes('comp2'));
      expect(comp2.version).to.equal('0.0.2');
    });
    it('should keep other DependencyResolver data fields, such as packageName', () => {
      const comp1HeadOnLane = helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`);
      const obj = helper.command.catComponent(`comp1@${comp1HeadOnLane}`);
      const depsResolver = obj.extensions.find((e) => e.name === 'teambit.dependencies/dependency-resolver');
      expect(depsResolver.data.packageName).to.equal(`@${helper.scopes.remote}/comp1`);
    });
  });

  describe('merging main into a lane when main has advanced since the lane forked', () => {
    let headComp1OnLane: string;
    let comp1Tag2: string;
    let comp1Tag3: string;
    let comp1Head: string;
    let comp2Tag2: string;
    let comp2Tag3: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild(); // 0.0.1 - the fork point of the lane
      helper.command.export();
      helper.command.createLane('dev');
      // only comp1 is on the lane. comp2 stays a main component in the workspace
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();
      headComp1OnLane = helper.command.getHeadOfLane('dev', 'comp1');
      const laneWs = helper.scopeHelper.cloneWorkspace();

      // main advances by a few versions the lane never saw
      helper.command.switchLocalLane('main', '-x');
      helper.command.tagAllWithoutBuild('--unmodified'); // 0.0.2
      comp1Tag2 = helper.command.getHead('comp1');
      comp2Tag2 = helper.command.getHead('comp2');
      helper.command.tagAllWithoutBuild('--unmodified'); // 0.0.3
      comp1Tag3 = helper.command.getHead('comp1');
      comp2Tag3 = helper.command.getHead('comp2');
      helper.command.tagAllWithoutBuild('--unmodified'); // 0.0.4
      comp1Head = helper.command.getHead('comp1');
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(laneWs);
      helper.command.mergeLane('main', '-x');
    });
    it('should merge main into the lane and snap the lane component', () => {
      const head = helper.command.getHeadOfLane('dev', 'comp1');
      expect(head).to.not.equal(headComp1OnLane);
    });
    it('should import the head of main', () => {
      expect(() => helper.command.catObject(comp1Head)).to.not.throw();
    });
    it('should not import the main-history gap between the common-snap and the head of main', () => {
      // 0.0.2 and 0.0.3 are between the fork point (0.0.1) and the head of main (0.0.4). they are
      // not needed locally: lane scopes are lean - export skips main-history objects - and the
      // VersionHistory covers the divergence calculation
      expect(() => helper.command.catObject(comp1Tag2)).to.throw();
      expect(() => helper.command.catObject(comp1Tag3)).to.throw();
    });
    it('should not import the history of workspace components that are not on the lane', () => {
      expect(() => helper.command.catObject(comp2Tag2)).to.throw();
      expect(() => helper.command.catObject(comp2Tag3)).to.throw();
    });
    it('should still update non-lane components to the head of main in the .bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap.comp2.version).to.equal('0.0.4');
    });
    it('should export the lane successfully after the merge', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
  });

  describe('bit merge on main when the remote main has advanced by multiple snaps (diverged)', () => {
    let gapSnap: string;
    let remoteHead: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      const wsBeforeDiverge = helper.scopeHelper.cloneWorkspace();

      // remote main advances by two snaps the local never saw
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      gapSnap = helper.command.getHead('comp1');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      remoteHead = helper.command.getHead('comp1');
      helper.command.export();

      // diverge locally and merge the incoming changes
      helper.scopeHelper.getClonedWorkspace(wsBeforeDiverge);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.importComponent('comp1 --objects');
      helper.command.merge('comp1 --auto-merge-resolve theirs');
    });
    it('should generate a snap-merge snap with two parents, the local and the remote', () => {
      const lastVersion = helper.command.catComponent(`comp1@latest`);
      expect(lastVersion.parents).to.have.lengthOf(2);
      expect(lastVersion.parents).to.include(remoteHead);
    });
    it('should not import the gap between the common-snap and the remote head', () => {
      // the gap snap is main-history. it already exists on the remote, so it is never pushed from
      // here and is not needed for the three-way merge (which needs only the common-snap and the head)
      expect(() => helper.command.catObject(gapSnap)).to.throw();
    });
    it('should export the merge-snap successfully', () => {
      expect(() => helper.command.export()).to.not.throw();
    });
    it('bit log should show the full history including the gap snap', () => {
      const log = helper.command.logParsed('comp1');
      const hashes = log.map((logEntry) => logEntry.hash);
      expect(hashes).to.include(gapSnap);
      expect(hashes).to.include(remoteHead);
    });
  });
});
