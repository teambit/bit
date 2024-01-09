import chai, { expect } from 'chai';
import path from 'path';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('tag components on Harmony', function () {
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
    let beforeTagging: string;
    let beforeExporting: string;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponents();
      helper.command.export();

      bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);
      beforeTagging = helper.scopeHelper.cloneScope(bareTag.scopePath);
      beforeExporting = helper.scopeHelper.cloneRemoteScope();
    });
    after(() => {
      npmCiRegistry.destroy();
      helper = new Helper();
    });
    describe('tagging them all at the same time', () => {
      let data;
      before(() => {
        data = [
          {
            componentId: `${helper.scopes.remote}/comp1`,
            // dependencies: [`${helper.scopes.remote}/comp2@1.0.0`, `${helper.scopes.remote}/comp3@2.0.0`],
            versionToTag: `1.0.0`,
            message: `msg for first comp`,
          },
          {
            componentId: `${helper.scopes.remote}/comp2`,
            versionToTag: `0.0.2`,
            message: `msg for second comp`,
          },
          {
            componentId: `${helper.scopes.remote}/comp3`,
            versionToTag: `0.0.5`,
            message: `msg for third comp`,
          },
        ];
        // console.log('data', JSON.stringify(data));
        helper.command.tagFromScope(bareTag.scopePath, data);
      });
      it('should tag the components in the same version described in the json', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2`, bareTag.scopePath);
        expect(comp2OnBare.versions).to.have.property('0.0.2');
        const comp3OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp3`, bareTag.scopePath);
        expect(comp3OnBare.versions).to.have.property('0.0.5');
      });
      it('should save the tag-message according to what provided in the json', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@0.0.2`, bareTag.scopePath);
        expect(comp2OnBare.log.message).to.equal('msg for second comp');
        const comp3OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp3@0.0.5`, bareTag.scopePath);
        expect(comp3OnBare.log.message).to.equal('msg for third comp');
      });
      it('should keep the build data from previous snap and have the tag data from the current tag', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@0.0.2`, bareTag.scopePath);
        const builder = helper.general.getExtension(comp2OnBare, Extensions.builder).data;

        const pipelineTasks = builder.pipeline.map((p) => p.taskId);
        expect(pipelineTasks).to.include(Extensions.compiler); // previous snap

        const artifactsTasks = builder.artifacts.map((a) => a.task.id);
        expect(artifactsTasks).to.include(Extensions.compiler); // previous snap

        const pkgJson = builder.aspectsData.find((a) => a.aspectId === Extensions.pkg);
        expect(pkgJson.data.pkgJson.version).to.equal('0.0.2'); // new tag
      });
      it('the package should have the dists', () => {
        helper.scopeHelper.reInitLocalScope();
        const pkgName = helper.general.getPackageNameByCompName('comp1');
        helper.command.install(pkgName);
        const distPath = path.join(helper.scopes.localPath, 'node_modules', pkgName, 'dist');
        expect(distPath).to.be.a.path();
      });
      describe('running with --push flag', () => {
        before(() => {
          helper.scopeHelper.getClonedScope(beforeTagging, bareTag.scopePath);
          // changing the version to not collide with the registry during publish
          data[0].versionToTag = '1.0.1';
          data[1].versionToTag = '0.0.3';
          data[2].versionToTag = '0.0.6';
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
    describe('tagging them one by one', () => {
      before(() => {
        helper.scopeHelper.getClonedScope(beforeTagging, bareTag.scopePath);
        helper.scopeHelper.getClonedRemoteScope(beforeExporting);
        // tag comp3 first
        const data = [
          {
            componentId: `${helper.scopes.remote}/comp3`,
            versionToTag: `0.0.1`,
            message: `msg for third comp`,
          },
        ];
        helper.command.tagFromScope(bareTag.scopePath, data, '--push');

        // then tag comp2
        const data2 = [
          {
            componentId: `${helper.scopes.remote}/comp2`,
            dependencies: [`${helper.scopes.remote}/comp3@0.0.1`],
            versionToTag: `0.0.1`,
            message: `msg for second comp`,
          },
        ];
        // console.log('data2', JSON.stringify(data2));
        helper.command.tagFromScope(bareTag.scopePath, data2);

        // then tag comp1
        const data3 = [
          {
            componentId: `${helper.scopes.remote}/comp1`,
            dependencies: [`${helper.scopes.remote}/comp2@0.0.1`],
            versionToTag: `0.0.1`,
            message: `msg for first comp`,
          },
        ];
        // console.log('data2', JSON.stringify(data3));
        helper.command.tagFromScope(bareTag.scopePath, data3);
      });
      it('should save the dependency version according to the version provided in the json', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@0.0.1`, bareTag.scopePath);
        expect(comp2OnBare.dependencies[0].id.name).to.equal('comp3');
        expect(comp2OnBare.dependencies[0].id.version).to.equal('0.0.1');

        expect(comp2OnBare.flattenedDependencies[0].name).to.equal('comp3');
        expect(comp2OnBare.flattenedDependencies[0].version).to.equal('0.0.1');

        const depResolver = comp2OnBare.extensions.find((e) => e.name === Extensions.dependencyResolver).data;
        const dep = depResolver.dependencies.find((d) => d.id.includes('comp3'));
        expect(dep.version).to.equal('0.0.1');
      });
      it('should save the dependency version according to the version provided in the json', () => {
        const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp1@0.0.1`, bareTag.scopePath);
        expect(comp2OnBare.dependencies[0].id.name).to.equal('comp2');
        expect(comp2OnBare.dependencies[0].id.version).to.equal('0.0.1');

        const depResolver = comp2OnBare.extensions.find((e) => e.name === Extensions.dependencyResolver).data;
        const dep = depResolver.dependencies.find((d) => d.id.includes('comp2'));
        expect(dep.version).to.equal('0.0.1');
      });
    });
  });

  (supportNpmCiRegistryTesting ? describe : describe.skip)('tagging them one by one with semver', () => {
    let bareTag;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      // new npmCiRegistry to avoid collision with the previous one
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponents();
      helper.command.export();

      bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);

      // tag comp3 first
      const data = [
        {
          componentId: `${helper.scopes.remote}/comp3`,
          versionToTag: `0.0.6`,
          message: `msg for third comp`,
        },
      ];
      helper.command.tagFromScope(bareTag.scopePath, data, '--push');

      // then tag comp2
      const data2 = [
        {
          componentId: `${helper.scopes.remote}/comp2`,
          dependencies: [`${helper.scopes.remote}/comp3@~0.0.1`],
          versionToTag: `10.0.0`,
          message: `msg for second comp`,
        },
      ];
      // console.log('data2', JSON.stringify(data2));
      helper.command.tagFromScope(bareTag.scopePath, data2);
    });
    after(() => {
      npmCiRegistry.destroy();
      helper = new Helper();
    });
    it('should save the dependency version according to the version provided in the json', () => {
      const comp2OnBare = helper.command.catComponent(`${helper.scopes.remote}/comp2@10.0.0`, bareTag.scopePath);
      expect(comp2OnBare.dependencies[0].id.name).to.equal('comp3');
      expect(comp2OnBare.dependencies[0].id.version).to.equal('0.0.6');

      expect(comp2OnBare.flattenedDependencies[0].name).to.equal('comp3');
      expect(comp2OnBare.flattenedDependencies[0].version).to.equal('0.0.6');

      const depResolver = comp2OnBare.extensions.find((e) => e.name === Extensions.dependencyResolver).data;
      const dep = depResolver.dependencies.find((d) => d.id.includes('comp3'));
      expect(dep.version).to.equal('0.0.6');
    });
  });

  describe('tagging from non-head version', () => {
    let bareTag;
    let headBeforeTag: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponents();
      const firstSnap = helper.command.getHead('comp1');
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.tagAllComponents();
      helper.command.export();
      headBeforeTag = helper.command.getHead('comp1');
      bareTag = helper.scopeHelper.getNewBareScope('-bare-merge');
      helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, bareTag.scopePath);

      const data = [
        {
          componentId: `${helper.scopes.remote}/comp1@${firstSnap}`,
          message: `msg for first comp`,
        },
      ];
      // console.log('data', JSON.stringify(data));
      helper.command.tagFromScope(bareTag.scopePath, data, '--push --ignore-newest-version');
    });
    it('should tag and export with no errors and should set the parent to the previous head', () => {
      const compOnRemote = helper.command.catComponent(
        `${helper.scopes.remote}/comp1@latest`,
        helper.scopes.remotePath
      );
      expect(compOnRemote.parents[0]).to.equal(headBeforeTag);
    });
    it('should keep the files according to the specified snap and not from the head', () => {
      const compOnRemote = helper.command.catComponent(
        `${helper.scopes.remote}/comp1@latest`,
        helper.scopes.remotePath
      );
      const fileHash = compOnRemote.files[0].file;
      const fileContent = helper.command.catObject(fileHash, undefined, helper.scopes.remotePath);
      expect(fileContent).to.not.have.string('v2');
    });
  });
});
