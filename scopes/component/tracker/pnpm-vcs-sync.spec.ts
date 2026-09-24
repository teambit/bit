import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import { parse as parseYaml } from 'yaml';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';
import { Extensions } from '@teambit/legacy.constants';
import { TrackerAspect } from './tracker.aspect';
import type { TrackerMain } from './tracker.main.runtime';
import {
  applyPnpmImportPlan,
  createPnpmVcsCatalogBindingsOnLoad,
  createPnpmVcsImportPlan,
  discoverPnpmProjectManifests,
  resolvePnpmVcsCatalogBindings,
  sanitizePnpmComponentName,
  syncPnpmWorkspace,
} from './pnpm-vcs-sync.cmd';

const DEPENDENCY_RESOLVER = 'teambit.dependencies/dependency-resolver';

describe('bit pnpm sync', function () {
  this.timeout(0);

  let workspaceData: WorkspaceData;
  let workspace: Workspace;
  let tracker: TrackerMain;

  async function setupPnpmWorkspace(files: Record<string, unknown>) {
    workspaceData = mockWorkspace();
    Object.entries(files).forEach(([filePath, content]) => {
      const absolutePath = path.join(workspaceData.workspacePath, filePath);
      if (typeof content === 'string') fs.outputFileSync(absolutePath, content);
      else fs.outputJsonSync(absolutePath, content);
    });
    const harmony = await loadManyAspects([WorkspaceAspect, TrackerAspect], workspaceData.workspacePath);
    workspace = harmony.get<Workspace>(WorkspaceAspect.id);
    tracker = harmony.get<TrackerMain>(TrackerAspect.id);
  }
  afterEach(async () => {
    if (workspaceData) await destroyWorkspace(workspaceData);
  });

  const twoPackages = {
    'package.json': { name: '@acme/repository' },
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    'packages/math/package.json': { name: '@acme/math' },
    'packages/math/index.js': 'module.exports = 1;\n',
    'packages/app/package.json': { name: '@acme/app', dependencies: { '@acme/math': 'workspace:*' } },
    'packages/app/index.js': 'module.exports = 2;\n',
  };
  const entryAt = (rootDir: string) =>
    workspace.consumer.bitMap.components.find((componentMap) => componentMap.rootDir === rootDir);

  it('should track every project and the workspace root, with package.json as source', async () => {
    await setupPnpmWorkspace(twoPackages);
    const result = await syncPnpmWorkspace(workspace, tracker);

    expect(result.components.map(({ rootDir }) => rootDir)).to.deep.equal([
      'packages/app',
      'packages/math',
      WORKSPACE_ROOT_DIR,
    ]);
    const root = entryAt(WORKSPACE_ROOT_DIR)!;
    expect(root.id.fullName).to.equal('acme/repository-workspace');
    expect(root.mainFile).to.equal('package.json');
    const math = entryAt('packages/math')!;
    expect(math.id.fullName).to.equal('acme/math');
    expect(math.mainFile).to.equal('package.json');
    expect(math.files.map((file) => file.relativePath)).to.include('package.json');
    expect(math.config?.[DEPENDENCY_RESOLVER]).to.deep.equal({ packageName: '@acme/math' });
    expect(math.config?.[Extensions.envs]).to.deep.equal({ env: 'teambit.harmony/empty-env' });
    // the projects are their own components, so the root does not carry their files
    expect(root.files.map((file) => file.relativePath)).to.not.include('packages/math/index.js');
    const workspaceJsonc = await fs.readFile(path.join(workspaceData.workspacePath, 'workspace.jsonc'), 'utf8');
    expect(workspaceJsonc).to.include('"trackAllFiles": true');
  });

  it('should keep the ids of tracked projects on a re-run, even after a package was renamed', async () => {
    await setupPnpmWorkspace(twoPackages);
    await syncPnpmWorkspace(workspace, tracker);
    const mathId = entryAt('packages/math')!.id;
    await fs.outputJson(path.join(workspaceData.workspacePath, 'packages/math/package.json'), {
      name: '@acme/arithmetic',
    });

    await syncPnpmWorkspace(workspace, tracker);

    const math = entryAt('packages/math')!;
    expect(math.id.isEqual(mathId)).to.be.true;
    // the package name follows the manifest, it is what other packages depend on
    expect(math.config?.[DEPENDENCY_RESOLVER]).to.deep.equal({ packageName: '@acme/arithmetic' });
    expect(workspace.consumer.bitMap.components).to.have.lengthOf(3);
  });

  describe('the env of a project', () => {
    const PNPM_ENV = 'my-org.envs/pnpm-scripts';
    const withBuildScript = {
      ...twoPackages,
      'packages/math/package.json': { name: '@acme/math', scripts: { build: 'tsc' } },
    };
    // a custom env is configured by its version, which the remote would be asked for
    const stubEnvVersion = () => {
      workspace.resolveEnvIdWithPotentialVersionForConfig = async (envId) => `${envId.toStringWithoutVersion()}@1.0.0`;
    };

    it('should get the pnpm env when it has a script to run, and the empty env otherwise', async () => {
      await setupPnpmWorkspace(withBuildScript);
      stubEnvVersion();
      await syncPnpmWorkspace(workspace, tracker, { env: PNPM_ENV });

      const math = entryAt('packages/math')!;
      expect(math.config?.[`${PNPM_ENV}@1.0.0`]).to.deep.equal({});
      expect(math.config?.[Extensions.envs]).to.deep.equal({ env: PNPM_ENV });
      expect(entryAt('packages/app')!.config?.[Extensions.envs]).to.deep.equal({ env: 'teambit.harmony/empty-env' });
    });

    it('should move to the empty env on a re-run once its scripts are gone', async () => {
      await setupPnpmWorkspace(withBuildScript);
      stubEnvVersion();
      await syncPnpmWorkspace(workspace, tracker, { env: PNPM_ENV });
      await fs.outputJson(path.join(workspaceData.workspacePath, 'packages/math/package.json'), { name: '@acme/math' });

      await syncPnpmWorkspace(workspace, tracker, { env: PNPM_ENV });

      const math = entryAt('packages/math')!;
      expect(math.config?.[`${PNPM_ENV}@1.0.0`]).to.be.undefined;
      expect(math.config?.[Extensions.envs]).to.deep.equal({ env: 'teambit.harmony/empty-env' });
    });

    it('should move a project from the env an earlier sync gave to the one given now', async () => {
      await setupPnpmWorkspace(withBuildScript);
      stubEnvVersion();
      await syncPnpmWorkspace(workspace, tracker, { env: PNPM_ENV });

      await syncPnpmWorkspace(workspace, tracker, { env: 'my-org.envs/other-scripts' });

      const math = entryAt('packages/math')!;
      expect(math.config?.[`${PNPM_ENV}@1.0.0`]).to.be.undefined;
      expect(math.config?.['my-org.envs/other-scripts@1.0.0']).to.deep.equal({});
      expect(math.config?.[Extensions.envs]).to.deep.equal({ env: 'my-org.envs/other-scripts' });
    });

    it('should keep an env the user configured', async () => {
      await setupPnpmWorkspace(withBuildScript);
      stubEnvVersion();
      await syncPnpmWorkspace(workspace, tracker, { env: PNPM_ENV });
      const math = entryAt('packages/math')!;
      workspace.bitMap.removeComponentConfig(math.id, `${PNPM_ENV}@1.0.0`, false);
      workspace.bitMap.addComponentConfig(math.id, Extensions.envs, { env: 'teambit.harmony/node' });

      await syncPnpmWorkspace(workspace, tracker, { env: PNPM_ENV });

      expect(entryAt('packages/math')!.config?.[Extensions.envs]).to.deep.equal({ env: 'teambit.harmony/node' });
    });
  });

  it('should untrack a never-snapped project that left the pnpm workspace', async () => {
    await setupPnpmWorkspace(twoPackages);
    await syncPnpmWorkspace(workspace, tracker);
    await fs.writeFile(
      path.join(workspaceData.workspacePath, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\n  - "!packages/app"\n'
    );

    const result = await syncPnpmWorkspace(workspace, tracker);

    expect(result.removedComponents).to.have.lengthOf(1);
    expect(result.removedComponents[0]).to.have.string('acme/app');
    expect(entryAt('packages/app')).to.be.undefined;
  });

  it('should untrack a nameless project that left the pnpm workspace too', async () => {
    await setupPnpmWorkspace({ ...twoPackages, 'packages/app/package.json': { private: true } });
    await syncPnpmWorkspace(workspace, tracker);
    await fs.writeFile(
      path.join(workspaceData.workspacePath, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\n  - "!packages/app"\n'
    );

    const result = await syncPnpmWorkspace(workspace, tracker);

    expect(result.removedComponents).to.have.lengthOf(1);
    expect(entryAt('packages/app')).to.be.undefined;
  });

  it('should leave alone a component it did not track, even one with a package name of its own', async () => {
    await setupPnpmWorkspace({ ...twoPackages, 'tools/lint/index.js': 'module.exports = 3;\n' });
    const { componentId } = await tracker.track({ rootDir: 'tools/lint', componentName: 'tools/lint' });
    workspace.bitMap.addComponentConfig(componentId, DEPENDENCY_RESOLVER, { packageName: '@acme/lint' });

    const result = await syncPnpmWorkspace(workspace, tracker);

    expect(result.removedComponents).to.deep.equal([]);
    expect(entryAt('tools/lint')).to.not.be.undefined;
  });

  it('should drop the package name a package.json no longer gives', async () => {
    await setupPnpmWorkspace(twoPackages);
    await syncPnpmWorkspace(workspace, tracker);
    await fs.outputJson(path.join(workspaceData.workspacePath, 'packages/math/package.json'), { private: true });

    await syncPnpmWorkspace(workspace, tracker);

    expect(entryAt('packages/math')!.config?.[DEPENDENCY_RESOLVER]).to.be.undefined;
  });

  it('should track the package.json of a project that was a component before the sync', async () => {
    await setupPnpmWorkspace(twoPackages);
    // before the sync, bit generates package.json, so it is not source
    await tracker.track({ rootDir: 'packages/math', componentName: 'acme/math' });
    expect(entryAt('packages/math')!.files.map((file) => file.relativePath)).to.not.include('package.json');

    await syncPnpmWorkspace(workspace, tracker);
    await workspace.consumer.bitMap.loadFilesOf(entryAt('packages/math')!);

    expect(entryAt('packages/math')!.files.map((file) => file.relativePath)).to.include('package.json');
  });

  it('should refuse a project nested in another one before changing anything', async () => {
    await setupPnpmWorkspace({
      ...twoPackages,
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n  - packages/app/plugins/*\n',
      'packages/app/plugins/auth/package.json': { name: '@acme/auth' },
    });
    let error: Error | undefined;
    try {
      await syncPnpmWorkspace(workspace, tracker);
    } catch (err: any) {
      error = err;
    }
    expect(error?.message).to.have.string('"packages/app/plugins/auth" is inside the project at "packages/app"');
    expect(workspace.consumer.bitMap.components).to.have.lengthOf(0);
    expect(workspace.consumer.config.trackAllFiles).to.not.be.true;
  });
});

describe('pnpm workspace discovery', () => {
  let workspaceDir: string;
  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-pnpm-discovery-'));
  });
  afterEach(async () => {
    await fs.remove(workspaceDir);
  });

  it('should list the project manifests the patterns match, minus the negated ones and the root', async () => {
    await fs.outputJson(path.join(workspaceDir, 'package.json'), { name: 'root' });
    await fs.outputJson(path.join(workspaceDir, 'packages/a/package.json'), { name: 'a' });
    await fs.outputJson(path.join(workspaceDir, 'packages/b/package.json'), { name: 'b' });
    await fs.outputJson(path.join(workspaceDir, 'packages/b/node_modules/dep/package.json'), { name: 'dep' });
    await fs.outputJson(path.join(workspaceDir, 'apps/web/package.json'), { name: 'web' });

    expect(await discoverPnpmProjectManifests(workspaceDir, ['.', 'packages/**', 'apps/*', '!apps/web'])).to.deep.equal(
      ['packages/a/package.json', 'packages/b/package.json']
    );
  });

  it('should derive a component name from a package name', () => {
    expect(sanitizePnpmComponentName('@Acme/Math.Utils')).to.equal('acme/math-utils');
    expect(() => sanitizePnpmComponentName('@/')).to.throw('unable to derive a Bit component name');
  });
});

describe('pnpm workspace import plan', () => {
  describe('a catalog entry of a package the code never imports', () => {
    // bit detects dependencies from the code, so a package only package.json declares has no dependency
    const planImport = async (workspaceManifest: string, snappedSpecifier?: string) => {
      const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-pnpm-plan-'));
      try {
        await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), workspaceManifest);
        const workspaceStub = {
          path: workspaceDir,
          consumer: { bitMap: { getComponentIdByRootPath: () => ({ toString: () => 'acme.scope/root' }) } },
        } as any;
        const dependencyResolverStub = {
          getDependenciesFromLegacyComponent: () => ({ findByPkgNameOrCompId: () => undefined }),
        } as any;
        const trackerData = snappedSpecifier
          ? {
              pnpmVcsCatalogBindings: {
                schemaVersion: 1,
                bindings: [{ catalogName: 'default', packageName: 'lodash', specifier: snappedSpecifier }],
              },
            }
          : undefined;
        const component = {
          id: { toString: () => 'acme.scope/app@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          componentMap: { rootDir: 'packages/app' },
          extensions: { findCoreExtension: () => (trackerData ? { data: trackerData } : undefined) },
          files: [
            {
              relative: 'package.json',
              contents: Buffer.from(JSON.stringify({ name: '@acme/app', dependencies: { lodash: 'catalog:' } })),
            },
          ],
        } as any;
        return await createPnpmVcsImportPlan(workspaceStub, dependencyResolverStub, [component]);
      } finally {
        await fs.remove(workspaceDir);
      }
    };
    it('should leave it alone when the catalog has it', async () => {
      const plan = await planImport("catalog:\n  lodash: '4.17.21'\n", '^4.17.0');
      expect(plan?.components.map(({ packageName }) => packageName)).to.deep.equal(['@acme/app']);
      expect(plan?.catalogs).to.deep.equal([]);
    });
    it('should add the range the component was snapped with when the catalog is without it', async () => {
      // the component came from another pnpm workspace, whose catalog had the entry
      const plan = await planImport('packages: []\n', '^4.17.0');
      expect(plan?.catalogs).to.deep.equal([{ catalogName: 'default', packageName: 'lodash', specifier: '^4.17.0' }]);
    });
    it('should not add a "workspace:" entry, the package it named is not here', async () => {
      const plan = await planImport('packages: []\n', 'workspace:*');
      expect(plan?.catalogs).to.deep.equal([]);
    });
    it('should add nothing when the component was snapped with no such entry', async () => {
      const plan = await planImport('packages: []\n');
      expect(plan?.catalogs).to.deep.equal([]);
    });
  });

  it('should leave the pnpm manifest byte-identical when the imported packages are covered already', async () => {
    // what a clone restores: the versioned manifest, whose patterns cover every package it lists
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-pnpm-clone-'));
    try {
      const manifestContent = "# the user's own comment\npackages:\n  - 'packages/*'\n";
      await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), manifestContent);
      const appManifest = '{"name":"@acme/app","dependencies":{"@acme/math":"workspace:*"}}';
      await fs.outputFile(path.join(workspaceDir, 'packages/app/package.json'), appManifest);

      await applyPnpmImportPlan(workspaceDir, {
        schemaVersion: 1,
        components: [{ id: 'acme.scope/app@aaaa', rootDir: 'packages/app', packageName: '@acme/app' }],
        catalogs: [],
      });

      expect(await fs.readFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'utf8')).to.equal(manifestContent);
      expect(await fs.readFile(path.join(workspaceDir, 'packages/app/package.json'), 'utf8')).to.equal(appManifest);
    } finally {
      await fs.remove(workspaceDir);
    }
  });

  it('should apply selective Bit imports as exact catalog fallbacks and rebind them when local', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-pnpm-import-'));
    try {
      await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages: []\n');
      await fs.outputJson(path.join(workspaceDir, 'components/app/package.json'), {
        name: '@acme/app',
        dependencies: { '@acme/math': 'catalog:' },
      });

      await applyPnpmImportPlan(workspaceDir, {
        schemaVersion: 1,
        components: [
          {
            id: 'acme.scope/app@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            rootDir: 'components/app',
            packageName: '@acme/app',
          },
        ],
        catalogs: [
          {
            catalogName: 'default',
            packageName: '@acme/math',
            specifier: '0.0.0-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            componentId: 'acme.scope/math@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          },
        ],
      });

      expect(await fs.readJson(path.join(workspaceDir, 'components/app/package.json'))).to.have.nested.property(
        'dependencies.@acme/math',
        'catalog:'
      );
      let workspaceManifest = parseYaml(await fs.readFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'utf8'));
      expect(workspaceManifest.catalog['@acme/math']).to.equal('0.0.0-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

      await fs.outputJson(path.join(workspaceDir, 'components/math/package.json'), { name: '@acme/math' });
      await applyPnpmImportPlan(workspaceDir, {
        schemaVersion: 1,
        components: [
          {
            id: 'acme.scope/math@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            rootDir: 'components/math',
            packageName: '@acme/math',
          },
        ],
        catalogs: [],
      });

      workspaceManifest = parseYaml(await fs.readFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'utf8'));
      expect(workspaceManifest.catalog['@acme/math']).to.equal('workspace:*');
      expect(workspaceManifest.packages).to.deep.equal(['components/app', 'components/math']);
    } finally {
      await fs.remove(workspaceDir);
    }
  });

  describe('a package imported without the sibling it refers to by "workspace:"', () => {
    let workspaceDir: string;
    const appManifest = {
      name: '@acme/app',
      dependencies: { '@acme/math': 'workspace:*', '@acme/strings': 'workspace:^' },
    };
    const importApp = async () => {
      await fs.outputJson(path.join(workspaceDir, 'components/app/package.json'), appManifest);
      const workspaceStub = {
        path: workspaceDir,
        consumer: { bitMap: { getComponentIdByRootPath: () => ({ toString: () => 'acme.scope/root' }) } },
      } as any;
      const mathDependency = { type: 'package', version: '0.0.0-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' };
      const stringsDependency = { type: 'package', version: '1.0.0' };
      const dependencyResolverStub = {
        getDependenciesFromLegacyComponent: () => ({
          findByPkgNameOrCompId: (name: string) =>
            ({ '@acme/math': mathDependency, '@acme/strings': stringsDependency })[name],
        }),
      } as any;
      const component = {
        id: { toString: () => 'acme.scope/app@aaaa' },
        componentMap: { rootDir: 'components/app' },
        extensions: { findCoreExtension: () => undefined },
        files: [{ relative: 'package.json', contents: Buffer.from(JSON.stringify(appManifest)) }],
      } as any;
      const plan = await createPnpmVcsImportPlan(workspaceStub, dependencyResolverStub, [component]);
      await applyPnpmImportPlan(workspaceDir, plan!);
    };
    beforeEach(async () => {
      workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-pnpm-workspace-ref-'));
      await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), "packages:\n  - 'components/*'\n");
      await fs.outputJson(path.join(workspaceDir, 'components/strings/package.json'), { name: '@acme/strings' });
    });
    afterEach(async () => {
      await fs.remove(workspaceDir);
    });
    it('should bind the missing sibling to its exact version through the catalog', async () => {
      await importApp();
      const manifest = await fs.readJson(path.join(workspaceDir, 'components/app/package.json'));
      expect(manifest.dependencies['@acme/math']).to.equal('catalog:');
      const workspaceManifest = parseYaml(await fs.readFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'utf8'));
      expect(workspaceManifest.catalog).to.deep.equal({
        '@acme/math': '0.0.0-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      });
    });
    it('should leave a reference to a sibling the workspace has as is', async () => {
      await importApp();
      const manifest = await fs.readJson(path.join(workspaceDir, 'components/app/package.json'));
      expect(manifest.dependencies['@acme/strings']).to.equal('workspace:^');
    });
  });
});

describe('pnpm catalog bindings', () => {
  it('should track only the catalog entries a component refers to', () => {
    const manifest = {
      dependencies: {
        '@acme/math': 'catalog:',
        '@acme/test-utils': 'catalog:testing',
      },
    };
    const workspaceManifest = {
      catalog: {
        '@acme/math': 'workspace:*',
        '@acme/unrelated': '^1.0.0',
      },
      catalogs: {
        testing: {
          '@acme/test-utils': '2.0.0',
          '@acme/other-test-utils': '3.0.0',
        },
      },
    };

    expect(resolvePnpmVcsCatalogBindings(manifest, workspaceManifest)).to.deep.equal([
      { catalogName: 'default', packageName: '@acme/math', specifier: 'workspace:*' },
      { catalogName: 'testing', packageName: '@acme/test-utils', specifier: '2.0.0' },
    ]);
  });

  it('should read the default catalog the way an import writes it, when both of its forms are there', () => {
    const manifest = { dependencies: { '@acme/math': 'catalog:' } };
    const workspaceManifest = { catalog: {}, catalogs: { default: { '@acme/math': '1.0.0' } } };
    expect(resolvePnpmVcsCatalogBindings(manifest, workspaceManifest)).to.deep.equal([
      { catalogName: 'default', packageName: '@acme/math', specifier: null },
    ]);
  });

  it('should change only when one of the entries the component refers to changes', () => {
    const manifest = { dependencies: { '@acme/math': 'catalog:' } };
    const original = { catalog: { '@acme/math': 'workspace:*', '@acme/unrelated': '1.0.0' } };
    const unrelatedChange = { catalog: { '@acme/math': 'workspace:*', '@acme/unrelated': '2.0.0' } };
    const usedChange = { catalog: { '@acme/math': '2.0.0', '@acme/unrelated': '1.0.0' } };

    expect(resolvePnpmVcsCatalogBindings(manifest, unrelatedChange)).to.deep.equal(
      resolvePnpmVcsCatalogBindings(manifest, original)
    );
    expect(resolvePnpmVcsCatalogBindings(manifest, usedChange)).not.to.deep.equal(
      resolvePnpmVcsCatalogBindings(manifest, original)
    );
  });

  it('should record a missing entry, so deleting it changes the component', () => {
    const manifest = { dependencies: { '@acme/math': 'catalog:' } };
    expect(resolvePnpmVcsCatalogBindings(manifest, { catalog: {} })).to.deep.equal([
      { catalogName: 'default', packageName: '@acme/math', specifier: null },
    ]);
  });

  describe('on component load', () => {
    let workspaceDir: string;
    beforeEach(async () => {
      workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-pnpm-catalog-'));
    });
    afterEach(async () => {
      await fs.remove(workspaceDir);
    });
    const componentWithPackageJson = (manifest: Record<string, unknown>) =>
      ({
        id: { toString: () => 'acme/consumer' },
        filesystem: {
          files: [{ relative: 'package.json', contents: Buffer.from(JSON.stringify(manifest)) }],
        },
      }) as any;

    it('should add the bindings to the aspect data', async () => {
      await fs.writeFile(
        path.join(workspaceDir, 'pnpm-workspace.yaml'),
        "catalog:\n  '@acme/math': 2.0.0\n  '@acme/unrelated': 1.0.0\n"
      );
      const onLoad = createPnpmVcsCatalogBindingsOnLoad({ path: workspaceDir } as any);
      expect(await onLoad(componentWithPackageJson({ dependencies: { '@acme/math': 'catalog:' } }))).to.deep.equal({
        pnpmVcsCatalogBindings: {
          schemaVersion: 1,
          bindings: [{ catalogName: 'default', packageName: '@acme/math', specifier: '2.0.0' }],
        },
      });
    });

    it('should add nothing in a workspace with no pnpm manifest', async () => {
      const onLoad = createPnpmVcsCatalogBindingsOnLoad({ path: workspaceDir } as any);
      expect(await onLoad(componentWithPackageJson({ dependencies: { '@acme/math': 'catalog:' } }))).to.be.undefined;
    });
  });
});
