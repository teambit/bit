import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('merge lanes from scope', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('merge from scope lane to main (squash)', () => {
    let bareMerge;
    let comp1HeadOnLane: string;
    let comp2HeadOnLane: string;
    let comp2PreviousHeadOnLane: string;
    let comp2HeadOnMain: string;
    let beforeMerging: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild('comp2', '-m "first tag"');
      comp2HeadOnMain = helper.command.getHead('comp2');
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified -m "first snap on lane dev"');
      comp2PreviousHeadOnLane = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified -m "second snap on lane dev"');
      comp1HeadOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      comp2HeadOnLane = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.export();
      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      beforeMerging = helper.scopeHelper.cloneScope(bareMerge.scopePath);
      const title = 'this is the title of the CR';
      const titleBase64 = Buffer.from(title).toString('base64');
      helper.command.mergeLaneFromScope(
        bareMerge.scopePath,
        `${helper.scopes.remote}/dev`,
        `--title-base64 ${titleBase64}`
      );
    });
    it('should merge to main', () => {
      expect(helper.command.getHead(`${helper.scopes.remote}/comp1`, bareMerge.scopePath)).to.equal(comp1HeadOnLane);
      expect(helper.command.getHead(`${helper.scopes.remote}/comp2`, bareMerge.scopePath)).to.equal(comp2HeadOnLane);
    });
    it('should squash by default', () => {
      const cat = helper.command.catComponent(`${helper.scopes.remote}/comp2@latest`, bareMerge.scopePath);
      expect(cat.parents).to.have.lengthOf(1);
      const parent = cat.parents[0];
      expect(parent).to.not.equal(comp2PreviousHeadOnLane);
      expect(parent).to.equal(comp2HeadOnMain);
    });
    it('should squash the messages because --title is provided', () => {
      const versionObj = helper.command.catComponent(`${helper.scopes.remote}/comp2@latest`, bareMerge.scopePath);
      const msg = versionObj.log.message;
      expect(msg).to.include('this is the title of the CR\n[*] second snap on lane dev\n[*] first snap on lane dev');
    });
    it('should not export by default', () => {
      const comp1OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp1`, bareMerge.scopePath);
      const comp1OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp1`, helper.scopes.remotePath);
      expect(comp1OnBare.head).to.not.equal(comp1OnRemote.head);

      const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2`, bareMerge.scopePath);
      const comp2OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp2`, helper.scopes.remotePath);
      expect(comp2OnBare.head).to.not.equal(comp2OnRemote.head);
    });
    describe('running with --push flag', () => {
      before(() => {
        helper.scopeHelper.getClonedScope(beforeMerging, bareMerge.scopePath);
        helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`, '--push');
      });
      it('should export the modified components to the remote', () => {
        const comp1OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp1`, bareMerge.scopePath);
        const comp1OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp1`, helper.scopes.remotePath);
        expect(comp1OnBare.head).to.equal(comp1OnRemote.head);

        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2`, bareMerge.scopePath);
        const comp2OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp2`, helper.scopes.remotePath);
        expect(comp2OnBare.head).to.equal(comp2OnRemote.head);
      });
    });
  });
  describe('merge from scope lane to another lane (no squash)', () => {
    let bareMerge;
    let comp1HeadOnLaneB: string;
    let comp2HeadOnLaneB: string;
    let comp2PreviousHeadOnLaneB: string;
    let comp2HeadOnLaneA: string;
    let beforeMerging: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('lane-a');
      helper.command.snapComponentWithoutBuild('comp2');
      comp2HeadOnLaneA = helper.command.getHeadOfLane('lane-a', 'comp2');
      helper.command.export();

      helper.command.createLane('lane-b');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      comp2PreviousHeadOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      comp1HeadOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp1');
      comp2HeadOnLaneB = helper.command.getHeadOfLane('lane-b', 'comp2');
      helper.command.export();
      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      beforeMerging = helper.scopeHelper.cloneScope(bareMerge.scopePath);
      helper.command.mergeLaneFromScope(
        bareMerge.scopePath,
        `${helper.scopes.remote}/lane-b`,
        `${helper.scopes.remote}/lane-a`
      );
    });
    it('should merge to lane-a', () => {
      expect(helper.command.getHeadOfLane(`${helper.scopes.remote}/lane-a`, `comp1`, bareMerge.scopePath)).to.equal(
        comp1HeadOnLaneB
      );
      expect(helper.command.getHeadOfLane(`${helper.scopes.remote}/lane-a`, `comp2`, bareMerge.scopePath)).to.equal(
        comp2HeadOnLaneB
      );
    });
    it('should not squash by default', () => {
      const head = helper.command.getHeadOfLane(`${helper.scopes.remote}/lane-a`, `comp2`, bareMerge.scopePath);
      const cat = helper.command.catComponent(`${helper.scopes.remote}/comp2@${head}`, bareMerge.scopePath);
      expect(cat.parents).to.have.lengthOf(1);
      const parent = cat.parents[0];
      expect(parent).to.equal(comp2PreviousHeadOnLaneB);
      expect(parent).to.not.equal(comp2HeadOnLaneA);
    });
    describe('running with --push flag', () => {
      before(() => {
        helper.scopeHelper.getClonedScope(beforeMerging, bareMerge.scopePath);
        helper.command.mergeLaneFromScope(
          bareMerge.scopePath,
          `${helper.scopes.remote}/lane-b`,
          `${helper.scopes.remote}/lane-a --push`
        );
      });
      it('should export the modified lane to the remote', () => {
        const headOnBare = helper.command.getHeadOfLane(`${helper.scopes.remote}/lane-a`, `comp2`, bareMerge.scopePath);
        const headOnRemote = helper.command.getHeadOfLane(
          `${helper.scopes.remote}/lane-a`,
          `comp2`,
          helper.scopes.remotePath
        );
        expect(headOnBare).to.equal(headOnRemote);
      });
    });
  });
  describe('merge from scope, main to lane when they are diverged', () => {
    let bareMerge;
    let comp1HeadOnMain: string;
    let comp2HeadOnMain: string;
    let comp2OnLane: string;
    let beforeMerging: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified -m "first snap on lane dev"');
      comp2OnLane = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.export();

      helper.command.switchLocalLane('main', '-x');
      helper.command.tagAllWithoutBuild('--unmodified -m "second tag on main"');
      helper.command.tagAllWithoutBuild('--unmodified -m "third tag on main"');
      helper.command.export();

      comp1HeadOnMain = helper.command.getHead('comp1');
      comp2HeadOnMain = helper.command.getHead('comp2');

      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      beforeMerging = helper.scopeHelper.cloneScope(bareMerge.scopePath);
      helper.command.mergeLaneFromScope(bareMerge.scopePath, 'main', `${helper.scopes.remote}/dev`);
    });
    it('should snap on the lane with two parents: main and lane', () => {
      const comp1HeadOnLane = helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`, bareMerge.scopePath);
      const comp2HeadOnLane = helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp2`, bareMerge.scopePath);
      expect(comp1HeadOnLane).to.not.equal(comp1HeadOnMain);
      expect(comp2HeadOnLane).to.not.equal(comp2HeadOnMain);

      const obj = helper.command.catComponent(`comp2@${comp2HeadOnLane}`, bareMerge.scopePath);
      expect(obj.parents).to.have.lengthOf(2);
      expect(obj.parents).to.include(comp2HeadOnMain);
      expect(obj.parents).to.include(comp2OnLane);
    });
    describe('running with --push flag', () => {
      before(() => {
        helper.scopeHelper.getClonedScope(beforeMerging, bareMerge.scopePath);
        helper.command.mergeLaneFromScope(bareMerge.scopePath, 'main', `${helper.scopes.remote}/dev --push`);
      });
      it('should export the modified lane to the remote', () => {
        const comp1HeadOnLane = helper.command.getHeadOfLane(
          `${helper.scopes.remote}/dev`,
          `comp1`,
          bareMerge.scopePath
        );
        const comp2HeadOnLane = helper.command.getHeadOfLane(
          `${helper.scopes.remote}/dev`,
          `comp2`,
          bareMerge.scopePath
        );
        expect(helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`, helper.scopes.remotePath)).to.equal(
          comp1HeadOnLane
        );
        expect(helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp2`, helper.scopes.remotePath)).to.equal(
          comp2HeadOnLane
        );
      });
    });
  });
  describe('merge from scope, main to lane when they are diverged with file conflicts', () => {
    let bareMerge;
    let comp2OnLane: string;
    let beforeMerging: string;
    let mergeResultsParsed: Record<string, any>;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(2, undefined, 'on-lane');
      helper.command.snapAllComponentsWithoutBuild();
      comp2OnLane = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.export();

      helper.command.switchLocalLane('main', '-x');
      helper.fixtures.populateComponents(2, undefined, 'on-main');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      beforeMerging = helper.scopeHelper.cloneScope(bareMerge.scopePath);
      mergeResultsParsed = helper.command.mergeLaneFromScopeParsed(
        bareMerge.scopePath,
        'main',
        `${helper.scopes.remote}/dev`
      );
    });
    it('should indicate that there are conflicts and provide the files with the conflicts', () => {
      expect(mergeResultsParsed).to.have.property('conflicts');
      expect(mergeResultsParsed.conflicts[0].files).to.include('index.js');
    });
    describe('running with --push flag', () => {
      before(() => {
        helper.scopeHelper.getClonedScope(beforeMerging, bareMerge.scopePath);
        helper.command.mergeLaneFromScopeParsed(bareMerge.scopePath, 'main', `${helper.scopes.remote}/dev --push`);
      });
      it('should not export because of the conflicts', () => {
        expect(helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp2`, helper.scopes.remotePath)).to.equal(
          comp2OnLane
        );
      });
    });
  });
  describe('merge from scope, main to lane when they are diverged with config conflicts', () => {
    let bareMerge;
    let comp1OnLane: string;
    let beforeMerging: string;
    let mergeResultsParsed: Record<string, any>;
    let envName: string;
    let envId: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);

      envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.setEnv('comp1', envId);

      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.tagWithoutBuild(envName, '--skip-auto-tag --unmodified'); // 0.0.2
      helper.command.tagWithoutBuild(envName, '--skip-auto-tag --unmodified'); // 0.0.3
      helper.command.export();

      helper.command.createLane();
      helper.command.setEnv('comp1', `${envId}@0.0.2`);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      comp1OnLane = helper.command.getHeadOfLane('dev', 'comp1');

      helper.command.switchLocalLane('main', '-x');
      helper.command.tagAllWithoutBuild(); // auto-update env to 0.0.3
      helper.command.export();

      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      beforeMerging = helper.scopeHelper.cloneScope(bareMerge.scopePath);
      mergeResultsParsed = helper.command.mergeLaneFromScopeParsed(
        bareMerge.scopePath,
        'main',
        `${helper.scopes.remote}/dev`
      );
    });
    it('should indicate that there is a conflict with the config', () => {
      expect(mergeResultsParsed).to.have.property('conflicts');
      expect(mergeResultsParsed.conflicts[0].config).to.be.true;
    });
    describe('running with --push flag', () => {
      before(() => {
        helper.scopeHelper.getClonedScope(beforeMerging, bareMerge.scopePath);
        helper.command.mergeLaneFromScopeParsed(bareMerge.scopePath, 'main', `${helper.scopes.remote}/dev --push`);
      });
      it('should not export because of the conflicts', () => {
        expect(helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`, helper.scopes.remotePath)).to.equal(
          comp1OnLane
        );
      });
    });
  });
  describe('merge from scope, main to lane when the main is ahead', () => {
    let bareMerge;
    let comp1HeadOnMain: string;
    let comp2HeadOnMain: string;
    let comp2OnLane: string;
    let beforeMerging: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      comp2OnLane = helper.command.getHeadOfLane('dev', 'comp2');
      helper.command.export();

      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLane('dev', '-x');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      comp1HeadOnMain = helper.command.getHead('comp1');
      comp2HeadOnMain = helper.command.getHead('comp2');

      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      beforeMerging = helper.scopeHelper.cloneScope(bareMerge.scopePath);
      helper.command.mergeLaneFromScope(bareMerge.scopePath, 'main', `${helper.scopes.remote}/dev`);
    });
    it('should update the lane', () => {
      const comp1HeadOnLane = helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`, bareMerge.scopePath);
      const comp2HeadOnLane = helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp2`, bareMerge.scopePath);
      expect(comp1HeadOnLane).to.equal(comp1HeadOnMain);
      expect(comp2HeadOnLane).to.equal(comp2HeadOnMain);
      expect(comp2HeadOnLane).to.not.equal(comp2OnLane);

      const obj = helper.command.catComponent(`comp2@${comp2HeadOnLane}`, bareMerge.scopePath);
      expect(obj.parents).to.have.lengthOf(1); // no snap-merge
    });
    describe('running with --push flag', () => {
      before(() => {
        helper.scopeHelper.getClonedScope(beforeMerging, bareMerge.scopePath);
        helper.command.mergeLaneFromScope(bareMerge.scopePath, 'main', `${helper.scopes.remote}/dev --push`);
      });
      it('should export the modified lane to the remote', () => {
        const comp1HeadOnLane = helper.command.getHeadOfLane(
          `${helper.scopes.remote}/dev`,
          `comp1`,
          bareMerge.scopePath
        );
        const comp2HeadOnLane = helper.command.getHeadOfLane(
          `${helper.scopes.remote}/dev`,
          `comp2`,
          bareMerge.scopePath
        );
        expect(helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`, helper.scopes.remotePath)).to.equal(
          comp1HeadOnLane
        );
        expect(helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp2`, helper.scopes.remotePath)).to.equal(
          comp2HeadOnLane
        );
      });
    });
  });
  describe('merge from scope with multiple scopes and --push flag', () => {
    let bareMerge;
    let scope2Name;
    let scope2Path;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild('comp2');
      helper.command.export();
      helper.command.createLane();

      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      scope2Name = scopeName;
      scope2Path = scopePath;
      helper.scopeHelper.addRemoteScope(scope2Path);
      helper.command.setScope(scope2Name, 'comp1');

      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      helper.scopeHelper.addRemoteScope(scope2Path, bareMerge.scopePath);
      helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`, '--push');
    });
    it('should export the modified components to the remote', () => {
      const comp1OnBare = helper.command.catComponent(`${scope2Name}/comp1`, bareMerge.scopePath);
      const comp1OnRemote = helper.command.catComponent(`${scope2Name}/comp1`, scope2Path);
      expect(comp1OnBare.head).to.equal(comp1OnRemote.head);

      const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2`, bareMerge.scopePath);
      const comp2OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp2`, helper.scopes.remotePath);
      expect(comp2OnBare.head).to.equal(comp2OnRemote.head);
    });
    it('bit import from the second scope should not throw', () => {
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.scopeHelper.addRemoteScope(scope2Path);
      expect(() => helper.command.import(`${scope2Name}/comp1`)).to.not.throw();
    });
  });
  describe('main to lane and multiple scopes when a main-version is missing from lane-scope', () => {
    let bareMerge;
    let scope2Name;
    let scope2Path;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      const mainScope = helper.scopeHelper.cloneLocalScope();

      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      scope2Name = scopeName;
      scope2Path = scopePath;
      helper.scopeHelper.addRemoteScope(scope2Path);
      helper.command.createLane();
      helper.command.changeLaneScope(scope2Name);

      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();

      helper.scopeHelper.getClonedLocalScope(mainScope);
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.tagAllWithoutBuild('--unmodified');
      helper.command.export();

      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      helper.scopeHelper.addRemoteScope(scope2Path, bareMerge.scopePath);
    });
    it('should be able to merge with --push with no errors', () => {
      const cmd = () => helper.command.mergeLaneFromScope(bareMerge.scopePath, 'main', `${scope2Name}/dev --push`);
      expect(cmd).to.not.throw();
    });
  });
  describe('merge from scope lane to main when it is not up to date', () => {
    let bareMerge;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild('comp2');
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('main');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
    });
    it('should throw', () => {
      const mergeFunc = () => helper.command.mergeLaneFromScope(bareMerge.scopePath, `${helper.scopes.remote}/dev`);
      expect(mergeFunc).to.throw('unable to merge, the following components are not up-to-date');
    });
  });
  describe('merge from scope, main to lane when they are diverged with dependencies update', () => {
    let bareMerge;
    let comp1HeadOnMain: string;
    let comp1OnLane: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();
      comp1OnLane = helper.command.getHeadOfLane('dev', 'comp1');

      helper.command.switchLocalLane('main', '-x');
      helper.command.tagAllWithoutBuild('--unmodified -m "second tag on main"');
      helper.command.export();
      comp1HeadOnMain = helper.command.getHead('comp1');

      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      helper.command.mergeLaneFromScope(bareMerge.scopePath, 'main', `${helper.scopes.remote}/dev`);
    });
    it('should snap on the lane with two parents: main and lane', () => {
      const comp1HeadOnLane = helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`, bareMerge.scopePath);
      const obj = helper.command.catComponent(`comp2@${comp1HeadOnLane}`, bareMerge.scopePath);
      expect(obj.parents).to.have.lengthOf(2);
      expect(obj.parents).to.include(comp1HeadOnMain);
      expect(obj.parents).to.include(comp1OnLane);
    });
    it('should update the dependencies according to main', () => {
      const comp1HeadOnLane = helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`, bareMerge.scopePath);
      const obj = helper.command.catComponent(`comp1@${comp1HeadOnLane}`, bareMerge.scopePath);
      expect(obj.dependencies[0].id.name).to.equal('comp2');
      expect(obj.dependencies[0].id.version).to.equal('0.0.2');
      expect(obj.flattenedDependencies[0].version).to.equal('0.0.2');
      const depsResolver = obj.extensions.find((e) => e.name === 'teambit.dependencies/dependency-resolver');
      const comp2 = depsResolver.data.dependencies.find((d) => d.id.includes('comp2'));
      expect(comp2.version).to.equal('0.0.2');
    });
  });
  describe('merge from scope, main to lane when they are diverged with env update', () => {
    let bareMerge;
    let envName: string;
    let envId: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane();
      helper.command.snapComponentWithoutBuild('comp1', '--unmodified');
      helper.command.export();
      helper.command.getHeadOfLane('dev', 'comp1');

      helper.command.switchLocalLane('main', '-x');

      envName = helper.env.setCustomEnv();
      envId = `${helper.scopes.remote}/${envName}`;
      helper.command.setEnv('comp1', envId);
      helper.command.tagAllWithoutBuild('-m "second tag on main"');
      helper.command.export();

      bareMerge = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareMerge.scopePath);
      helper.command.mergeLaneFromScope(bareMerge.scopePath, 'main', `${helper.scopes.remote}/dev`);
    });
    it('should update the env according to main', () => {
      const comp1HeadOnLane = helper.command.getHeadOfLane(`${helper.scopes.remote}/dev`, `comp1`, bareMerge.scopePath);
      const obj = helper.command.catComponent(`comp1@${comp1HeadOnLane}`, bareMerge.scopePath);
      const envExt = obj.extensions.find((e) => e.name === 'teambit.envs/envs');
      expect(envExt.config.env).to.equal(envId);
      expect(envExt.data.id).to.equal(envId);
    });
  });
});
