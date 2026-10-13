const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { installed, source } = require('./load-source.cjs');
const { collectRustStatusIssues } = source('scopes/harmony/bit/rust-status-issues.ts');
const { ComponentID } = installed('@teambit/component-id');
const { IssuesList } = installed('@teambit/component-issues');
const { PkgMain } = installed('@teambit/pkg/dist/pkg.main.runtime.js');
const { CompilerMain } = installed('@teambit/compiler/dist/compiler.main.runtime.js');
const { InstallMain } = installed('@teambit/install/dist/install.main.runtime.js');
const { DependencyResolverMain } = installed('@teambit/dependency-resolver/dist/dependency-resolver.main.runtime.js');
const FindCycles = installed('@teambit/insights/dist/all-insights/find-circulars.js').default;
const { Graph, Node, Edge } = installed('@teambit/graph.cleargraph');

test('cold built-in issues match canonical callbacks across package layouts and dependency cycles', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-status-issues-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const identities = ['test.scope/alpha@1.0.0', 'test.scope/beta@1.0.0'];
  for (let variant = 0; variant < 24; variant++) {
    await fs.rm(path.join(root, 'node_modules'), { recursive: true, force: true });
    const rootComponents = variant % 2 === 0;
    const duplicate = variant % 3 !== 2;
    const cycle = variant % 4 === 0;
    const context = {
      workspace: {
        'teambit.dependencies/dependency-resolver': {
          rootComponents,
          policy:
            variant % 3 === 0
              ? { dependencies: { '@test/scope.alpha': '^1' } }
              : variant % 3 === 2
                ? { devDependencies: { '@test/scope.alpha': '^1' } }
                : {},
        },
      },
      packageJson: variant % 3 === 1 ? { devDependencies: { '@test/scope.alpha': '^1' } } : {},
      models: [],
      versions: [],
      targets: identities.map((id) => ({
        identity: id.split('@')[0],
        directory: id.includes('alpha') ? 'alpha' : variant >= 18 ? '.' : 'beta',
      })),
    };
    const rows = identities.map((identity, index) => ({
      identity,
      packageName: index ? '@test/scope.beta' : '@test/scope.alpha',
      dependencies: index ? (cycle ? [identities[0]] : []) : [identities[1]],
      issues: [{ type: 'MissingManuallyConfiguredPackages', data: JSON.stringify(['missing-type']) }],
    }));
    const alphaDir =
      variant % 6 < 2
        ? 'node_modules/@test/scope.alpha'
        : variant % 6 < 4
          ? 'node_modules/.bit_roots/test.scope_alpha/node_modules/@test/scope.alpha'
          : 'node_modules/.bit_roots/teambit.harmony_node/node_modules/@test/scope.alpha';
    await fs.mkdir(path.join(root, alphaDir, 'dist'), { recursive: true });
    if (variant % 5 === 0) await fs.mkdir(path.join(root, 'node_modules/@test/scope.beta'), { recursive: true });
    const canonical = rows.map((row) => ({
      id: { toString: () => row.identity, toStringWithoutVersion: () => row.identity.split('@')[0] },
      state: {
        _consumer: {
          id: ComponentID.fromString(row.identity),
          name: row.identity.split('/')[1].split('@')[0],
          scope: 'test.scope',
          bindingPrefix: '@test',
        },
        issues: IssuesList.deserialize(row.issues),
      },
    }));
    const depContext = {
      hasRootComponents: () => rootComponents,
      getModulePath: (component) => path.join(root, 'node_modules', rows[canonical.indexOf(component)].packageName),
      getPackageName: (component) => rows[canonical.indexOf(component)].packageName,
      envs: { getEnvId: () => 'teambit.harmony/node' },
      getComponentDirInBitRoots: DependencyResolverMain.prototype.getComponentDirInBitRoots,
    };
    // Canonical resolver returns relative paths and checks from workspace cwd.
    const cwd = process.cwd();
    process.chdir(root);
    try {
      const pkgContext = {
        dependencyResolver: {
          getModulePath: (component) => path.join('node_modules', rows[canonical.indexOf(component)].packageName),
        },
        workspace: {
          path: root,
          bitMap: {
            getBitmapEntryIfExist: (id) => ({
              rootDir: context.targets.find((target) => target.identity === id.toStringWithoutVersion()).directory,
            }),
          },
        },
        getModulePath: PkgMain.prototype.getModulePath,
        isModulePathExists: PkgMain.prototype.isModulePathExists,
      };
      for (const component of canonical)
        await PkgMain.prototype.addMissingLinksFromNodeModulesIssue.call(pkgContext, component);
      await CompilerMain.prototype.addMissingDistsIssue.call(
        {
          envs: { getOrCalculateEnv: () => ({ env: { getCompiler: () => ({}) } }) },
          isDistDirExists: async (component) => {
            const modulePath = DependencyResolverMain.prototype.getRuntimeModulePath.call(depContext, component, {
              workspacePath: root,
              rootComponentsPath: path.join(root, 'node_modules/.bit_roots'),
              isInWorkspace: true,
            });
            try {
              await fs.access(path.resolve(root, modulePath, 'dist'));
              return true;
            } catch {
              return false;
            }
          },
        },
        canonical,
        []
      );
      const graph = new Graph(
        rows.map((row) => new Node(row.identity, true)),
        rows.flatMap((row) => row.dependencies.map((dep) => new Edge(row.identity, dep, true)))
      );
      await InstallMain.prototype.addDuplicateComponentAndPackageIssue.call(
        {
          dependencyResolver: {
            getWorkspacePolicy: () => ({
              find: (name) => (duplicate && name === '@test/scope.alpha' ? { dependencyId: name } : undefined),
            }),
          },
          workspace: {
            path: root,
            componentDir: (id) =>
              path.join(
                root,
                context.targets.find((target) => target.identity === id.toStringWithoutVersion()).directory
              ),
          },
        },
        canonical
      );
      await new FindCycles({ getGraphIds: async () => graph }).addAsComponentIssue(canonical);
      const expected = canonical.map((component) => ({
        id: component.id.toStringWithoutVersion(),
        issues: component.state.issues.toObjectIncludeDataAsString(),
      }));
      assert.deepEqual(await collectRustStatusIssues(root, context, rows), expected, `variant ${variant}`);
    } finally {
      process.chdir(cwd);
    }
  }
});

test('unknown graph vertices and deprecation/removal heads decline before formatting a partial result', async () => {
  const row = {
    identity: 'test.scope/a@1.0.0',
    packageName: '@test/scope.a',
    dependencies: ['other.scope/b@1.0.0'],
    issues: [],
  };
  assert.equal(await collectRustStatusIssues('/unused', {}, [row]), undefined);
  row.dependencies = [];
  for (const name of ['teambit.component/deprecation', 'teambit.component/remove']) {
    const context = { models: [{ head: 'hash' }], versions: [['hash', { extensions: [{ name, config: {} }] }]] };
    assert.equal(await collectRustStatusIssues('/unused', context, [row]), undefined);
  }
});
