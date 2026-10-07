import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { DependenciesMain } from '@teambit/dependencies';
import { DependenciesAspect } from '@teambit/dependencies';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { IsolatorMain } from '@teambit/isolator';
import { IsolatorAspect } from '@teambit/isolator';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

const DEP_RESOLVER_ID = 'teambit.dependencies/dependency-resolver';

/**
 * load a fresh harmony, simulating a new bit process. `workspacePolicy` is applied on the loaded dependency-resolver
 * rather than written to workspace.jsonc, because the developer's global config (~/.bitrc.jsonc) may configure the
 * dependency-resolver, and it replaces the workspace one entirely.
 */
async function loadProcess(workspacePath: string, workspacePolicy: Record<string, any> = {}) {
  const harmony = await loadManyAspects(
    [WorkspaceAspect, SnappingAspect, DependenciesAspect, IsolatorAspect, ScopeAspect, CLIAspect],
    workspacePath
  );
  const depResolver = harmony.get<DependencyResolverMain>(DependencyResolverAspect.id);
  depResolver.config.policy = workspacePolicy;
  depResolver.clearCache();
  const cli = harmony.get<CLIMain>(CLIAspect.id);
  const inWorkspace = async <T>(fn: () => Promise<T>): Promise<T> => {
    const originalCwd = process.cwd();
    process.chdir(workspacePath);
    try {
      return await fn();
    } finally {
      process.chdir(originalCwd);
    }
  };
  return {
    workspace: harmony.get<Workspace>(WorkspaceAspect.id),
    snapping: harmony.get<SnappingMain>(SnappingAspect.id),
    dependencies: harmony.get<DependenciesMain>(DependenciesAspect.id),
    isolator: harmony.get<IsolatorMain>(IsolatorAspect.id),
    scope: harmony.get<ScopeMain>(ScopeAspect.id),
    /** equivalent of `bit show <id> --json --legacy` */
    show: (id: string): Promise<any> =>
      inWorkspace(() => cli.getCommand('show')!.json!([id] as any, { legacy: true } as any)) as Promise<any>,
    /** equivalent of `bit cat-component <id> --json` */
    catComponent: (id: string): Promise<any> =>
      inWorkspace(() => cli.getCommand('cat-component')!.json!([id] as any, {})) as Promise<any>,
  };
}

type Process = Awaited<ReturnType<typeof loadProcess>>;

function getDepResolverExt(componentData: any) {
  return componentData.extensions.find(({ name }) => name === DEP_RESOLVER_ID);
}

/**
 * the package.json that is generated into the capsule of the given component (as `bit build` does).
 * with `fromModel`, the capsule is created from the snapped component as saved in the scope (and not from the
 * workspace files).
 */
async function getCapsulePackageJson(
  proc: Process,
  workspacePath: string,
  compName: string,
  { fromModel = false } = {}
) {
  const workspaceId = await proc.workspace.resolveComponentId(compName);
  const component = fromModel ? await proc.scope.getOrThrow(workspaceId) : await proc.workspace.get(workspaceId);
  const network = await proc.isolator.isolateComponents([component.id], {
    baseDir: workspacePath,
    rootBaseDir: path.join(workspacePath, 'capsules-root'),
    alwaysNew: true,
    installOptions: { installPackages: false },
    ...(fromModel ? { host: proc.scope, includeFromNestedHosts: true } : {}),
  });
  const capsule = network.graphCapsules.getCapsuleIgnoreVersion(component.id);
  if (!capsule) throw new Error(`capsule of ${compName} was not found`);
  return fs.readJsonSync(path.join(capsule.path, 'package.json'));
}

describe('a component is a peer dependency', function () {
  this.timeout(0);

  describe('set by the workspace policy', () => {
    let workspaceData: WorkspaceData;
    let workspacePath: string;
    let remote: string;
    let policy: Record<string, any>;
    before(async () => {
      workspaceData = mockWorkspace();
      ({ workspacePath, remoteScopeName: remote } = workspaceData);
      policy = { peerDependencies: { [`@${remote}/comp2`]: '*' } };
      await mockComponents(workspacePath, { numOfComponents: 2 });
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should save the peer dependency in the model', async () => {
      const output = await (await loadProcess(workspacePath, policy)).show(`${remote}/comp1`);
      expect(output.peerDependencies[0]).to.deep.equal({
        id: `${remote}/comp2`,
        relativePaths: [],
        packageName: `@${remote}/comp2`,
        versionRange: '*',
      });
      const peerDep = getDepResolverExt(output).data.dependencies.find(
        (dependency) => dependency.packageName === `@${remote}/comp2`
      );
      expect(peerDep.packageName).to.eq(`@${remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.version).to.eq('latest');
      expect(peerDep.versionRange).to.eq('*');
    });
    it('adds peer dependency to the generated package.json', async () => {
      const pkgJson = await getCapsulePackageJson(await loadProcess(workspacePath, policy), workspacePath, 'comp1');
      expect(pkgJson.peerDependencies).to.deep.equal({ [`@${remote}/comp2`]: '*' });
    });
  });

  describe('peer dependency is not broken after snap', () => {
    let workspaceData: WorkspaceData;
    let workspacePath: string;
    let remote: string;
    before(async () => {
      workspaceData = mockWorkspace();
      ({ workspacePath, remoteScopeName: remote } = workspaceData);
      await mockComponents(workspacePath, { numOfComponents: 2 });
      await (
        await loadProcess(workspacePath)
      ).dependencies.setDependency('comp1', [`@${remote}/comp2@+`], {
        peer: true,
      });
      await (await loadProcess(workspacePath)).snapping.snap({ build: false });
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should save the peer dependency in the model', async () => {
      const output = await (await loadProcess(workspacePath)).show(`${remote}/comp1`);
      const peerDepData = output.peerDependencies[0];
      expect(peerDepData.id).to.satisfy((id: string) => id.startsWith(`${remote}/comp2`));
      expect(peerDepData.packageName).to.satisfy((name: string) => name.startsWith(`@${remote}/comp2`));
      expect(peerDepData.versionRange).to.satisfy((range: string) => range.startsWith('+'));
      const peerDep = getDepResolverExt(output).data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.versionRange).to.eq('+');
    });
    it('should save the peer dependency in the scope data', async () => {
      const comp = await (await loadProcess(workspacePath)).catComponent('comp1@latest');
      const peerDep = getDepResolverExt(comp).data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.versionRange).to.eq('+');
    });
    it('adds peer dependency to the generated package.json', async () => {
      const proc = await loadProcess(workspacePath);
      const pkgJson = await getCapsulePackageJson(proc, workspacePath, 'comp1', { fromModel: true });
      const { head: comp2Head } = await proc.catComponent('comp2');
      expect(pkgJson.peerDependencies).to.deep.equal({
        [`@${remote}/comp2`]: `0.0.0-${comp2Head}`, // it can't be `+` as it's invalid in package.json.
      });
    });
  });
});
