import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import { parse as parseYaml } from 'yaml';
import { BitError } from '@teambit/bit-error';
import {
  applyPnpmImportPlan,
  assignFilesToProjects,
  createPnpmVcsCatalogBindingsOnLoad,
  createPnpmVcsWorkspaceTopology,
  discoverPnpmWorkspace,
  parseDurableComponentId,
  requirementsForProfile,
  resolvePnpmVcsCatalogBindings,
  validateWorkspaceRequirements,
} from './pnpm-vcs-sync.cmd';

describe('pnpm VCS workspace ownership', () => {
  it('discovers a raw pnpm workspace and migrates local workspace dependencies to catalogs', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-native-pnpm-discovery-'));
    try {
      await fs.outputJson(path.join(workspaceDir, 'package.json'), {
        name: '@acme/repository',
        pnpm: {
          vcs: {
            profile: { node: { implementation: 'node', version: '22.18.0' } },
          },
        },
      });
      await fs.writeFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
      await fs.outputJson(path.join(workspaceDir, 'packages/math/package.json'), {
        name: '@acme/math',
        engines: { node: '>=20' },
        scripts: { build: 'tsc -p tsconfig.json' },
      });
      await fs.outputJson(path.join(workspaceDir, 'packages/app/package.json'), {
        name: '@acme/app',
        dependencies: { '@acme/math': 'workspace:*' },
      });

      const inventory = await discoverPnpmWorkspace({ path: workspaceDir, defaultScope: 'acme.scope' } as any);

      expect(inventory).to.include({
        schemaVersion: 2,
        defaultScope: 'acme.scope',
        rootComponentName: 'acme/repository-workspace',
        rootMainFile: 'package.json',
      });
      expect(inventory.projects.find(({ rootDir }) => rootDir === 'packages/math')).to.deep.include({
        rootDir: 'packages/math',
        componentName: 'acme/math',
        manifestFile: 'package.json',
        requirements: { node: { implementation: 'node', version: '>=20' } },
        hasWorkspaceScripts: true,
      });
      expect(inventory.projects.find(({ rootDir }) => rootDir === 'packages/app')?.hasWorkspaceScripts).to.equal(false);
      expect(await fs.readJson(path.join(workspaceDir, 'packages/app/package.json'))).to.have.nested.property(
        'dependencies.@acme/math',
        'catalog:'
      );
      expect(
        parseYaml(await fs.readFile(path.join(workspaceDir, 'pnpm-workspace.yaml'), 'utf8'))
      ).to.have.nested.property('catalog.@acme/math', 'workspace:*');
    } finally {
      await fs.remove(workspaceDir);
    }
  });

  it('applies selective Bit imports as exact catalog fallbacks and rebinds them when local', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-native-pnpm-import-'));
    try {
      await fs.writeFile(
        path.join(workspaceDir, 'pnpm-workspace.yaml'),
        'packages: []\nvcs:\n  provider: bit\n  schemaVersion: 1\n  rootComponent: acme.scope/root\n  components: {}\n'
      );
      await fs.outputJson(path.join(workspaceDir, 'components/app/package.json'), {
        name: '@acme/app',
        dependencies: { '@acme/math': 'workspace:*' },
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
      expect(workspaceManifest.vcs.components['components/app'].componentId).to.equal('acme.scope/app');

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

  it('assigns project files to the deepest project and leaves unclaimed files to the root component', () => {
    const result = assignFilesToProjects(
      [
        'pnpm-workspace.yaml',
        'pnpm-lock.yaml',
        'packages/app/package.json',
        'packages/app/index.ts',
        'packages/app/plugins/auth/package.json',
        'packages/app/plugins/auth/index.ts',
      ],
      [
        { rootDir: 'packages/app', componentName: 'app', manifestFile: 'package.json' },
        {
          rootDir: 'packages/app/plugins/auth',
          componentName: 'auth',
          manifestFile: 'package.json',
        },
      ]
    );

    expect(result.rootFiles).to.deep.equal(['pnpm-workspace.yaml', 'pnpm-lock.yaml']);
    expect(result.filesByRoot.get('packages/app')).to.deep.equal(['package.json', 'index.ts']);
    expect(result.filesByRoot.get('packages/app/plugins/auth')).to.deep.equal(['package.json', 'index.ts']);
  });

  it('accepts an aggregate toolchain and granular runtime requirement', () => {
    const profile = {
      toolchain: { implementation: 'bit', version: '2.2.23' },
      node: { implementation: 'node', version: '22.18.0' },
    };

    expect(() =>
      validateWorkspaceRequirements(
        profile,
        {
          toolchain: { implementation: 'bit', version: '^2.2' },
          node: { implementation: 'node', version: '>=20 <23' },
        },
        'packages/app'
      )
    ).not.to.throw();
  });

  it('rejects a different implementation in the same capability slot', () => {
    expect(() =>
      validateWorkspaceRequirements(
        { toolchain: { implementation: 'bun', version: '1.2.3' } },
        { toolchain: { implementation: 'deno', version: '^2' } },
        'packages/app'
      )
    ).to.throw(BitError, 'requires toolchain implementation deno, but the workspace selects bun');
  });

  it('rejects a selected version outside the component range', () => {
    expect(() =>
      validateWorkspaceRequirements(
        { toolchain: { implementation: 'bit', version: '3.0.0' } },
        { toolchain: { implementation: 'bit', version: '^2.2' } },
        'packages/app'
      )
    ).to.throw(BitError, 'requires toolchain bit@^2.2, but the workspace selects bit@3.0.0');
  });

  it('uses the locked profile as the default requirement for undeclared components', () => {
    const profile = {
      toolchain: { implementation: 'vite-plus', version: '1.4.0' },
    };

    expect(requirementsForProfile(profile)).to.deep.equal(profile);
    expect(requirementsForProfile(profile)).not.to.equal(profile);
  });

  it('tracks only catalog entries referenced by a component', () => {
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

  it('changes a component fingerprint only when one of its catalog entries changes', () => {
    const manifest = { dependencies: { '@acme/math': 'catalog:' } };
    const original = {
      catalog: { '@acme/math': 'workspace:*', '@acme/unrelated': '1.0.0' },
    };
    const unrelatedChange = {
      catalog: { '@acme/math': 'workspace:*', '@acme/unrelated': '2.0.0' },
    };
    const usedChange = {
      catalog: { '@acme/math': '2.0.0', '@acme/unrelated': '1.0.0' },
    };

    expect(resolvePnpmVcsCatalogBindings(manifest, unrelatedChange)).to.deep.equal(
      resolvePnpmVcsCatalogBindings(manifest, original)
    );
    expect(resolvePnpmVcsCatalogBindings(manifest, usedChange)).not.to.deep.equal(
      resolvePnpmVcsCatalogBindings(manifest, original)
    );
  });

  it('records a missing used catalog entry so deleting it changes component status', () => {
    const manifest = { dependencies: { '@acme/math': 'catalog:' } };

    expect(resolvePnpmVcsCatalogBindings(manifest, { catalog: {} })).to.deep.equal([
      { catalogName: 'default', packageName: '@acme/math', specifier: null },
    ]);
  });

  it('adds used catalog bindings to the tracker aspect data loaded by status', async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-pnpm-vcs-catalog-status-'));
    try {
      await fs.writeFile(
        path.join(workspaceDir, 'pnpm-workspace.yaml'),
        "catalog:\n  '@acme/math': 2.0.0\n  '@acme/unrelated': 1.0.0\n"
      );
      const component = {
        id: { toString: () => 'acme/consumer' },
        state: {
          aspects: {
            get: () => ({
              config: {
                pnpmVcs: {
                  schemaVersion: 1,
                  requirements: {},
                  appliedProfile: {},
                },
              },
              data: {},
            }),
          },
        },
        filesystem: {
          files: [
            {
              relative: 'package.json',
              contents: Buffer.from(JSON.stringify({ dependencies: { '@acme/math': 'catalog:' } })),
            },
          ],
        },
      };

      const onLoad = createPnpmVcsCatalogBindingsOnLoad({ path: workspaceDir } as any);
      expect(await onLoad(component as any)).to.deep.equal({
        pnpmVcsCatalogBindings: {
          schemaVersion: 1,
          bindings: [{ catalogName: 'default', packageName: '@acme/math', specifier: '2.0.0' }],
        },
      });
    } finally {
      await fs.remove(workspaceDir);
    }
  });

  it('stores a normalized version-free workspace topology on the root component', () => {
    expect(
      createPnpmVcsWorkspaceTopology('acme.workspace/root', [
        { id: 'acme.workspace/b', rootDir: 'packages/b', manifestFile: 'package.json', files: 2 },
        { id: 'acme.workspace/root', rootDir: '.', files: 4 },
        { id: 'acme.workspace/a', rootDir: 'packages/a', manifestFile: 'package.json', files: 2 },
      ])
    ).to.deep.equal({
      schemaVersion: 1,
      rootComponent: 'acme.workspace/root',
      components: [
        { rootDir: 'packages/a', componentId: 'acme.workspace/a', manifestFile: 'package.json' },
        { rootDir: 'packages/b', componentId: 'acme.workspace/b', manifestFile: 'package.json' },
      ],
    });
  });

  it('accepts a scoped version-free durable component ID', () => {
    expect(parseDurableComponentId('acme.workspace/root', 'root component').toStringWithoutVersion()).to.equal(
      'acme.workspace/root'
    );
  });

  it('rejects a versioned durable component ID', () => {
    expect(() => parseDurableComponentId('acme.workspace/root@1.0.0', 'root component')).to.throw(
      BitError,
      'must have a scope and no version'
    );
  });
});
