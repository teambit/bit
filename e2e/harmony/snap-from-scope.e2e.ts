import chai, { expect } from 'chai';
import { BuildStatus, Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('snap components from scope', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('snap from scope', () => {
    let bareTag;
    let beforeSnappingOnScope: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponents();
      helper.command.export();

      bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);
      beforeSnappingOnScope = helper.scopeHelper.cloneScope(bareTag.scopePath);
    });
    describe('snapping them all at the same time without dependencies changes', () => {
      let data;
      before(() => {
        data = [
          {
            componentId: `${helper.scopes.remote}/comp1`,
            message: `msg for first comp`,
          },
          {
            componentId: `${helper.scopes.remote}/comp2`,
            message: `msg for second comp`,
          },
          {
            componentId: `${helper.scopes.remote}/comp3`,
            message: `msg for third comp`,
          },
        ];
        // console.log('data', JSON.stringify(data));
        helper.command.snapFromScope(bareTag.scopePath, data);
      });
      it('should save the snap-message according to what provided in the json', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@latest`, bareTag.scopePath);
        expect(comp2OnBare.log.message).to.equal('msg for second comp');
        const comp3OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp3@latest`, bareTag.scopePath);
        expect(comp3OnBare.log.message).to.equal('msg for third comp');
      });
      it('should not run the build pipeline by default', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@latest`, bareTag.scopePath);
        expect(comp2OnBare.buildStatus).to.equal(BuildStatus.Pending);
      });
      describe('running with --push flag', () => {
        before(() => {
          helper.scopeHelper.getClonedScope(beforeSnappingOnScope, bareTag.scopePath);
          helper.command.tagFromScope(bareTag.scopePath, data, '--push');
        });
        it('should export the modified components to the remote', () => {
          const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2`, bareTag.scopePath);
          const comp1OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp2`, helper.scopes.remotePath);
          expect(comp2OnBare.head).to.equal(comp1OnRemote.head);

          const comp3OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp3`, bareTag.scopePath);
          const comp2OnRemote = helper.command.catComponent(`${helper.scopes.remote}/comp3`, helper.scopes.remotePath);
          expect(comp3OnBare.head).to.equal(comp2OnRemote.head);
        });
      });
    });
    describe('snapping with dependencies changes', () => {
      before(() => {
        helper = new Helper();
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateComponents(3);
        helper.command.tagWithoutBuild();
        helper.command.tagWithoutBuild('comp3', '--skip-auto-tag --unmodified');
        helper.command.export();
        bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
        helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);
        beforeSnappingOnScope = helper.scopeHelper.cloneScope(bareTag.scopePath);
        const data = [
          {
            componentId: `${helper.scopes.remote}/comp2`,
            dependencies: [`${helper.scopes.remote}/comp3@0.0.2`],
            message: `msg for second comp`,
          },
        ];
        // console.log('data2', JSON.stringify(data2));
        helper.command.snapFromScope(bareTag.scopePath, data);
      });
      it('should save the dependency version according to the version provided in the json', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@latest`, bareTag.scopePath);
        expect(comp2OnBare.dependencies[0].id.name).to.equal('comp3');
        expect(comp2OnBare.dependencies[0].id.version).to.equal('0.0.2');

        expect(comp2OnBare.flattenedDependencies[0].name).to.equal('comp3');
        expect(comp2OnBare.flattenedDependencies[0].version).to.equal('0.0.2');

        const depResolver = comp2OnBare.extensions.find((e) => e.name === Extensions.dependencyResolver).data;
        const dep = depResolver.dependencies.find((d) => d.id.includes('comp3'));
        expect(dep.version).to.equal('0.0.2');
      });
    });
  });
  describe('snap on lane', () => {
    let bareScope;
    let comp1FirstSnap: string;
    let beforeSnappingOnScope: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.command.createLane();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponentsWithoutBuild();
      comp1FirstSnap = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.export();

      bareScope = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareScope.scopePath);
      beforeSnappingOnScope = helper.scopeHelper.cloneScope(bareScope.scopePath);
    });
    describe('snapping them all at the same time without dependencies changes', () => {
      let data;
      before(() => {
        data = [
          {
            componentId: `${helper.scopes.remote}/comp1`,
            message: `msg for first comp`,
          },
          {
            componentId: `${helper.scopes.remote}/comp2`,
            message: `msg for second comp`,
          },
          {
            componentId: `${helper.scopes.remote}/comp3`,
            message: `msg for third comp`,
          },
        ];
        // console.log('data', JSON.stringify(data));
        helper.command.snapFromScope(bareScope.scopePath, data, `--lane ${helper.scopes.remote}/dev`);
      });
      it('should not snap on main', () => {
        const comp1OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp1`, bareScope.scopePath);
        expect(comp1OnBare.head).to.be.undefined;
      });
      it('should snap on the lane', () => {
        const snapOnLane = helper.command.getHeadOfLane('dev', 'comp1', bareScope.scopePath);
        expect(snapOnLane).to.not.equal(comp1FirstSnap);
        const snapObj = helper.command.catObject(snapOnLane, true, bareScope.scopePath);
        expect(snapObj.parents[0]).to.equal(comp1FirstSnap);
      });
      describe('running with --push flag', () => {
        before(() => {
          helper.scopeHelper.getClonedScope(beforeSnappingOnScope, bareScope.scopePath);
          helper.command.snapFromScope(bareScope.scopePath, data, `--push --lane ${helper.scopes.remote}/dev`);
        });
        it('should export the modified components to the remote', () => {
          const snapOnLaneOnBareScope = helper.command.getHeadOfLane('dev', 'comp1', bareScope.scopePath);
          const snapOnLaneOnRemote = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
          expect(snapOnLaneOnBareScope).to.equal(snapOnLaneOnRemote);
        });
      });
    });
  });
  describe('snap on a lane when the component is new to the lane and the scope', () => {
    let bareScope;
    let beforeSnappingOnScope: string;
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
      helper.command.snapAllComponentsWithoutBuild();
      // snap multiple times on main. these snaps will be missing locally during the snap-from-scope
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      bareScope = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareScope.scopePath);
      helper.scopeHelper.addRemoteScope(scopePath, bareScope.scopePath);
      beforeSnappingOnScope = helper.scopeHelper.cloneScope(bareScope.scopePath);
    });
    describe('running with --push flag', () => {
      before(() => {
        const data = [
          {
            componentId: `${anotherRemote}/comp1`,
            message: `msg`,
          },
        ];
        helper.scopeHelper.getClonedScope(beforeSnappingOnScope, bareScope.scopePath);
        helper.command.snapFromScope(bareScope.scopePath, data, `--push --lane ${helper.scopes.remote}/dev`);
      });
      // previously, it was throwing an error during the export:
      // error: version "ebf5f55d3b8f1897cb1ac4f236b058b4ddd0c701" of component bnbu2jms-remote2/comp1 was not found on the filesystem. try running "bit import". if it doesn't help, try running "bit import bnbu2jms-remote2/comp1 --objects"
      // because it was trying to export previous snaps from main although they were not imported locally
      it('should export successfully to the remote', () => {
        const snapOnLaneOnBareScope = helper.command.getHeadOfLane('dev', 'comp1', bareScope.scopePath);
        const snapOnLaneOnRemote = helper.command.getHeadOfLane('dev', 'comp1', helper.scopes.remotePath);
        expect(snapOnLaneOnBareScope).to.equal(snapOnLaneOnRemote);
      });
    });
  });
});
