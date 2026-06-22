import fs from 'fs';
import { generateRandomStr } from '@teambit/toolbox.string.random';
import { DEPS_GRAPH } from '@teambit/harmony.modules.feature-toggle';
import { addDistTag } from '@pnpm/registry-mock';
import path from 'path';
import chai, { expect } from 'chai';
import chaiFs from 'chai-fs';
import yaml from 'js-yaml';
import { loadBit } from '@teambit/bit';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { IsolatorMain } from '@teambit/isolator';
import { IsolatorAspect } from '@teambit/isolator';
import type { SnappingMain } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';
import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(chaiFs);

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'dependencies graph data (isolation and lock flags)',
  function () {
    this.timeout(0);
    let npmCiRegistry: NpmCiRegistry;
    let helper: Helper;
    before(() => {
      helper = new Helper();
      helper.command.setFeatures(DEPS_GRAPH);
    });
    after(() => {
      helper.scopeHelper.destroy();
      helper.command.resetFeatures();
    });
    // Regression coverage for devDependencies + optionalDependencies round-trip through
    // the graph. The graph edge neighbours carry `lifecycle` and `optional` flags; these
    // must make it back into the regenerated lockfile's importer entries and snapshots.
    describe('dev and optional dependencies round-trip through the graph', function () {
      let randomStr: string;
      let depsGraph: any;
      let lockfile: any;
      before(async () => {
        randomStr = generateRandomStr(4);
        const name = `@ci/${randomStr}.{name}`;
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
        await npmCiRegistry.init();
        npmCiRegistry.setRegistry();
        helper.env.setCustomNewEnv(
          undefined,
          undefined,
          {
            policy: {
              dev: [
                {
                  name: '@pnpm.e2e/foo',
                  version: '100.0.0',
                  hidden: true,
                  force: true,
                },
              ],
            },
          },
          false,
          'custom-env/env',
          'custom-env/env'
        );
        helper.fs.createFile('comp1', 'comp1.js', 'require("@pnpm.e2e/bar"); // eslint-disable-line');
        helper.command.addComponent('comp1');
        helper.extensions.addExtensionToVariant('comp1', `${helper.scopes.remote}/custom-env/env`, {});
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
        await addDistTag({ package: '@pnpm.e2e/foo', version: '100.0.0', distTag: 'latest' });
        await addDistTag({ package: '@pnpm.e2e/bar', version: '100.0.0', distTag: 'latest' });
        helper.command.install('--add-missing-deps');
        helper.command.tagAllComponents('--skip-tests');
        helper.command.export();

        const versionObj = helper.command.catComponent('comp1@latest');
        depsGraph = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));

        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        npmCiRegistry.setRegistry();
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
        helper.command.import(`${helper.scopes.remote}/comp1@latest`);
        lockfile = yaml.load(fs.readFileSync(path.join(helper.scopes.localPath, 'pnpm-lock.yaml'), 'utf8'));
      });
      after(() => {
        npmCiRegistry.destroy();
        helper.scopeHelper.destroy();
      });
      it('should record the dev-only dependency in the graph with lifecycle=dev', () => {
        const directDependencies = depsGraph.edges.find((edge) => edge.id === '.').neighbours;
        const fooDep = directDependencies.find((dep) => dep.name === '@pnpm.e2e/foo');
        expect(fooDep, 'foo should be a direct dependency in the graph').to.exist;
        expect(fooDep.lifecycle).to.eq('dev');
      });
      it('should record the runtime dependency in the graph with lifecycle=runtime', () => {
        const directDependencies = depsGraph.edges.find((edge) => edge.id === '.').neighbours;
        const barDep = directDependencies.find((dep) => dep.name === '@pnpm.e2e/bar');
        expect(barDep, 'bar should be a direct dependency in the graph').to.exist;
        expect(barDep.lifecycle).to.eq('runtime');
      });
      it('should restore the lockfile from the graph', () => {
        expect(lockfile.bit.restoredFromModel).to.eq(true);
        expect(lockfile.packages).to.have.property('@pnpm.e2e/foo@100.0.0');
        expect(lockfile.packages).to.have.property('@pnpm.e2e/bar@100.0.0');
      });
    });
    describe('isolating components when only some model graphs exist', function () {
      let isolatedDepsGraph: any;
      let enrichedVersionObj: any;
      before(async () => {
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        helper.fs.createFile('comp1', 'comp1.js', 'require("is-odd"); // eslint-disable-line');
        helper.fs.createFile(
          'comp2',
          'comp2.js',
          `require("@${helper.scopes.remote}/comp1"); require("is-even"); // eslint-disable-line`
        );
        helper.command.addComponent('comp1');
        helper.command.addComponent('comp2');
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
        helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
          dependencies: {
            'is-odd': '1.0.0',
            'is-even': '1.0.0',
          },
        });
        helper.command.install();
        helper.command.tagWithoutBuild('comp1', '--skip-tests');
        helper.command.snapComponentWithoutBuild('comp2', '--skip-tests --no-lock-deps');

        const comp1VersionObj = helper.command.catComponent('comp1@latest');
        const comp2VersionObj = helper.command.catComponent('comp2@latest');
        expect(comp1VersionObj.dependenciesGraphRef).to.be.a('string');
        expect(comp2VersionObj.dependenciesGraphRef).to.be.undefined;

        const harmony = await loadBit(helper.scopes.localPath);
        const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
        const isolator = harmony.get<IsolatorMain>(IsolatorAspect.id);
        const snapping = harmony.get<SnappingMain>(SnappingAspect.id);
        const comp1Id = await workspace.resolveComponentId('comp1@latest');
        const comp2Id = await workspace.resolveComponentId('comp2@latest');
        const componentsToIsolate = await workspace.getMany([comp1Id, comp2Id]);
        const host = Object.create(workspace);
        host.getMany = async (ids) =>
          Promise.all(
            ids.map(async (id) => {
              const component = componentsToIsolate.find((comp) => comp.id.isEqual(id, { ignoreVersion: true }));
              if (component) return component;
              const loadedComponent = await workspace.get(id);
              if (!loadedComponent) throw new Error(`unable to find ${id.toString()} in the test host`);
              return loadedComponent;
            })
          );
        host.get = async (id) => {
          const component = componentsToIsolate.find((comp) => comp.id.isEqual(id, { ignoreVersion: true }));
          return component || workspace.get(id);
        };
        const comp2Component = componentsToIsolate.find((component) =>
          component.id.isEqual(comp2Id, { ignoreVersion: true })
        );
        if (!comp2Component) throw new Error(`unable to find ${comp2Id.toString()} in the test components`);
        await isolator.isolateComponents(
          [comp2Component.id],
          {
            alwaysNew: true,
            baseDir: path.join(helper.scopes.localPath, 'deps-graph-capsules'),
            host,
            useDependenciesGraph: true,
          },
          workspace.scope.legacyScope
        );
        isolatedDepsGraph = comp2Component.state._consumer.dependenciesGraph;
        await snapping.enrichComp(comp2Component);
        await workspace.scope.legacyScope.objects.persist();
        enrichedVersionObj = helper.command.catComponent('comp2@latest');
      });
      after(() => {
        helper.scopeHelper.destroy();
      });
      it('should populate missing component graphs from the capsule lockfile', () => {
        expect(isolatedDepsGraph, 'comp2 should have a dependencies graph after isolation').to.exist;
        const directDependencies = isolatedDepsGraph?.findRootEdge()?.neighbours;
        expect(directDependencies).to.deep.include({
          name: 'is-even',
          specifier: '1.0.0',
          id: 'is-even@1.0.0',
          lifecycle: 'runtime',
          optional: false,
        });
      });
      it('should save the regenerated graph to the model when the original component is enriched', () => {
        expect(enrichedVersionObj.dependenciesGraphRef).to.be.a('string');
      });
    });
    describe('snap/tag with --no-lock-deps', function () {
      let snapWithGraph: any;
      let snapWithoutGraph: any;
      let tagWithGraph: any;
      let tagWithoutGraph: any;
      before(async () => {
        const randomStr = generateRandomStr(4);
        const name = `@ci/${randomStr}.{name}`;
        helper.scopeHelper.setWorkspaceWithRemoteScope();
        npmCiRegistry = new NpmCiRegistry(helper);
        npmCiRegistry.configureCustomNameInPackageJsonHarmony(name);
        await npmCiRegistry.init();
        npmCiRegistry.setRegistry();
        helper.fixtures.populateComponents(1);
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
        helper.command.install();
        helper.command.snapAllComponentsWithoutBuild('--skip-tests');
        snapWithGraph = helper.command.catComponent('comp1@latest');
        helper.command.snapAllComponentsWithoutBuild('--skip-tests --unmodified --no-lock-deps');
        snapWithoutGraph = helper.command.catComponent('comp1@latest');
        helper.command.tagAllWithoutBuild('--skip-tests --unmodified');
        tagWithGraph = helper.command.catComponent('comp1@latest');
        helper.command.tagAllWithoutBuild('--skip-tests --unmodified --no-lock-deps');
        tagWithoutGraph = helper.command.catComponent('comp1@latest');
      });
      after(() => {
        npmCiRegistry.destroy();
        helper.scopeHelper.destroy();
      });
      it('should attach the dependencies graph to the snap by default', () => {
        expect(snapWithGraph.dependenciesGraphRef).to.be.a('string');
      });
      it('should not attach the dependencies graph to the snap when --no-lock-deps is set', () => {
        expect(snapWithoutGraph.dependenciesGraphRef).to.be.undefined;
      });
      it('should attach the dependencies graph to the tag by default', () => {
        expect(tagWithGraph.dependenciesGraphRef).to.be.a('string');
      });
      it('should not attach the dependencies graph to the tag when --no-lock-deps is set', () => {
        expect(tagWithoutGraph.dependenciesGraphRef).to.be.undefined;
      });
    });
  }
);
