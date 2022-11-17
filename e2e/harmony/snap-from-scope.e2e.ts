import chai, { expect } from 'chai';
import { BuildStatus } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

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
  (supportNpmCiRegistryTesting ? describe : describe.skip)('tag from scope', () => {
    let bareTag;
    let beforeSnappingOnScope: string;
    // let beforeExporting: string;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponents();
      helper.command.export();

      bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);
      beforeSnappingOnScope = helper.scopeHelper.cloneScope(bareTag.scopePath);
      // beforeExporting = helper.scopeHelper.cloneRemoteScope();
    });
    after(() => {
      npmCiRegistry.destroy();
    });
    describe('snapping them all at the same time', () => {
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
    // describe('tagging them one by one', () => {
    //   before(() => {
    //     helper.scopeHelper.getClonedScope(beforeSnappingOnScope, bareTag.scopePath);
    //     helper.scopeHelper.getClonedRemoteScope(beforeExporting);
    //     // tag comp3 first
    //     const data = [
    //       {
    //         componentId: `${helper.scopes.remote}/comp3`,
    //         versionToTag: `0.0.1`,
    //         message: `msg for third comp`,
    //       },
    //     ];
    //     helper.command.tagFromScope(bareTag.scopePath, data, '--push');

    //     // then tag comp2
    //     const data2 = [
    //       {
    //         componentId: `${helper.scopes.remote}/comp2`,
    //         dependencies: [`${helper.scopes.remote}/comp3@0.0.1`],
    //         versionToTag: `0.0.1`,
    //         message: `msg for second comp`,
    //       },
    //     ];
    //     // console.log('data2', JSON.stringify(data2));
    //     helper.command.tagFromScope(bareTag.scopePath, data2);

    //     // then tag comp1
    //     const data3 = [
    //       {
    //         componentId: `${helper.scopes.remote}/comp1`,
    //         dependencies: [`${helper.scopes.remote}/comp2@0.0.1`],
    //         versionToTag: `0.0.1`,
    //         message: `msg for first comp`,
    //       },
    //     ];
    //     // console.log('data2', JSON.stringify(data3));
    //     helper.command.tagFromScope(bareTag.scopePath, data3);
    //   });
    //   it('should save the dependency version according to the version provided in the json', () => {
    //     const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@0.0.1`, bareTag.scopePath);
    //     expect(comp2OnBare.dependencies[0].id.name).to.equal('comp3');
    //     expect(comp2OnBare.dependencies[0].id.version).to.equal('0.0.1');

    //     expect(comp2OnBare.flattenedDependencies[0].name).to.equal('comp3');
    //     expect(comp2OnBare.flattenedDependencies[0].version).to.equal('0.0.1');

    //     const depResolver = comp2OnBare.extensions.find((e) => e.name === Extensions.dependencyResolver).data;
    //     const dep = depResolver.dependencies.find((d) => d.id.includes('comp3'));
    //     expect(dep.version).to.equal('0.0.1');
    //   });
    //   it('should save the dependency version according to the version provided in the json', () => {
    //     const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp1@0.0.1`, bareTag.scopePath);
    //     expect(comp2OnBare.dependencies[0].id.name).to.equal('comp2');
    //     expect(comp2OnBare.dependencies[0].id.version).to.equal('0.0.1');

    //     const depResolver = comp2OnBare.extensions.find((e) => e.name === Extensions.dependencyResolver).data;
    //     const dep = depResolver.dependencies.find((d) => d.id.includes('comp2'));
    //     expect(dep.version).to.equal('0.0.1');
    //   });
    // });
  });
});
