import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import { BitError } from '@teambit/bit-error';
import {
  assignFilesToProjects,
  createPnpmVcsCatalogBindingsOnLoad,
  requirementsForProfile,
  resolvePnpmVcsCatalogBindings,
  validateWorkspaceRequirements,
} from './pnpm-vcs-sync.cmd';

describe('pnpm VCS workspace ownership', () => {
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
});
