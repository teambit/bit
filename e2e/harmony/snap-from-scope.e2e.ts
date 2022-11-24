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
    before(async () => {
      helper = new Helper();
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
});
