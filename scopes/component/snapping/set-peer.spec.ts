import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import { parse } from 'comment-json';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect } from '@teambit/cli';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import type { DependenciesMain } from '@teambit/dependencies';
import { DependenciesAspect } from '@teambit/dependencies';
import type { IsolatorMain } from '@teambit/isolator';
import { IsolatorAspect } from '@teambit/isolator';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

const DEP_RESOLVER_ID = 'teambit.dependencies/dependency-resolver';

type Process = Awaited<ReturnType<typeof loadProcess>>;

/**
 * load a fresh harmony, simulating a new bit process.
 */
async function loadProcess(workspacePath: string) {
  const harmony = await loadManyAspects(
    [WorkspaceAspect, SnappingAspect, DependenciesAspect, InstallAspect, IsolatorAspect, ScopeAspect, CLIAspect],
    workspacePath
  );
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
    install: harmony.get<InstallMain>(InstallAspect.id),
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

function expectStartsWith(actual: string, prefix: string) {
  expect(actual.startsWith(prefix), `"${actual}" should start with "${prefix}"`).to.equal(true);
}

function getDepResolverExt(componentData: any) {
  return componentData.extensions.find(({ name }) => name === DEP_RESOLVER_ID);
}

/**
 * what `bit install` does here, for the sake of the peer data: link the components into node_modules, so
 * the "bit.peer" field is written to their package.json.
 */
async function link(proc: Process) {
  await proc.install.link([], { rewire: true });
}

/**
 * the package.json that is generated into the capsule of the given component (as `bit build` does).
 * the capsules are created inside the workspace dir, so they are deleted along with it.
 * with `fromModel`, the capsule is created from the snapped component as saved in the scope (and not from the
 * workspace files). that's what the capsule created by the snap itself is made of.
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

describe('set-peer', function () {
  this.timeout(0);

  describe('a component is a peer dependency', () => {
    let workspaceData: WorkspaceData;
    let workspacePath: string;
    let remote: string;
    before(async () => {
      workspaceData = mockWorkspace();
      ({ workspacePath, remoteScopeName: remote } = workspaceData);
      await mockComponents(workspacePath, { numOfComponents: 2 });
      const proc = await loadProcess(workspacePath);
      await proc.dependencies.setPeer('comp2', '0');
      await link(await loadProcess(workspacePath));
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should save the peer dependency in the model', async () => {
      const proc = await loadProcess(workspacePath);
      const output = await proc.show(`${remote}/comp1`);
      expect(output.peerDependencies[0]).to.deep.equal({
        id: `${remote}/comp2`,
        relativePaths: [],
        packageName: `@${remote}/comp2`,
        versionRange: '0',
      });
      const peerDep = getDepResolverExt(output).data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.version).to.eq('latest');
      expect(peerDep.versionRange).to.eq('0');
    });
    it('adds peer dependency to the generated package.json', async () => {
      const pkgJson = await getCapsulePackageJson(await loadProcess(workspacePath), workspacePath, 'comp1');
      expect(pkgJson.peerDependencies).to.deep.equal({ [`@${remote}/comp2`]: '0' });
    });
    describe('peer dependency is not broken after snap', () => {
      before(async () => {
        const proc = await loadProcess(workspacePath);
        await proc.snapping.snap({ build: false });
      });
      it('should save the peer dependency in the model', async () => {
        const proc = await loadProcess(workspacePath);
        const output = await proc.show(`${remote}/comp1`);
        const peerDepData = output.peerDependencies[0];
        expectStartsWith(peerDepData.id, `${remote}/comp2`);
        expectStartsWith(peerDepData.packageName, `@${remote}/comp2`);
        expectStartsWith(peerDepData.versionRange, '0');
        const peerDep = getDepResolverExt(output).data.dependencies[0];
        expect(peerDep.packageName).to.eq(`@${remote}/comp2`);
        expect(peerDep.lifecycle).to.eq('peer');
        expect(peerDep.versionRange).to.eq('0');
      });
      it('should save the peer dependency in the scope data', async () => {
        const comp = await (await loadProcess(workspacePath)).catComponent('comp1@latest');
        const peerDep = getDepResolverExt(comp).data.dependencies[0];
        expect(peerDep.packageName).to.eq(`@${remote}/comp2`);
        expect(peerDep.lifecycle).to.eq('peer');
        expect(peerDep.versionRange).to.eq('0');
      });
      it('should save the always peer fields in the scope data', async () => {
        const comp = await (await loadProcess(workspacePath)).catComponent('comp2@latest');
        const depResolver = getDepResolverExt(comp);
        expect(depResolver.config.peer).to.eq(true);
        expect(depResolver.config.defaultPeerRange).to.eq('0');
      });
      it('adds peer dependency to the generated package.json', async () => {
        const proc = await loadProcess(workspacePath);
        const pkgJson = await getCapsulePackageJson(proc, workspacePath, 'comp1', { fromModel: true });
        expect(pkgJson.peerDependencies).to.deep.equal({ [`@${remote}/comp2`]: '0' });
      });
      describe('always peer config fields are preserved when setting new dependencies', () => {
        let bitMap: any;
        before(async () => {
          const proc = await loadProcess(workspacePath);
          await proc.dependencies.setDependency('comp2', ['is-odd@1.0.0']);
          bitMap = parse(fs.readFileSync(path.join(workspacePath, '.bitmap')).toString());
        });
        it('should readd always peer config fields to bitmap', () => {
          expect(bitMap.comp2.config[DEP_RESOLVER_ID].peer).to.eq(true);
          expect(bitMap.comp2.config[DEP_RESOLVER_ID].defaultPeerRange).to.eq('0');
        });
      });
    });
    describe('unset-peer', () => {
      before(async () => {
        const proc = await loadProcess(workspacePath);
        await proc.dependencies.unsetPeer('comp2');
        await link(await loadProcess(workspacePath));
        await (await loadProcess(workspacePath)).snapping.snap({ build: false });
      });
      it('should remove the always peer fields from the scope data', async () => {
        const comp = await (await loadProcess(workspacePath)).catComponent('comp2@latest');
        const depResolver = getDepResolverExt(comp);
        expect(depResolver.config.peer).to.eq(undefined);
        expect(depResolver.config.defaultPeerRange).to.eq(undefined);
      });
    });
  });
});

describe('set-peer using just the version range prefix', function () {
  this.timeout(0);

  describe('a component is a peer dependency', () => {
    let workspaceData: WorkspaceData;
    let workspacePath: string;
    let remote: string;
    before(async () => {
      workspaceData = mockWorkspace();
      ({ workspacePath, remoteScopeName: remote } = workspaceData);
      await mockComponents(workspacePath, { numOfComponents: 2 });
      await (await loadProcess(workspacePath)).dependencies.setPeer('comp2', '^');
      await link(await loadProcess(workspacePath));
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should save the peer dependency in the model', async () => {
      const output = await (await loadProcess(workspacePath)).show(`${remote}/comp1`);
      expect(output.peerDependencies[0]).to.deep.equal({
        id: `${remote}/comp2`,
        relativePaths: [],
        packageName: `@${remote}/comp2`,
        versionRange: '^0.0.1-new',
      });
      const peerDep = getDepResolverExt(output).data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.version).to.eq('latest');
      expect(peerDep.versionRange).to.eq('^0.0.1-new');
    });
    it('adds peer dependency to the generated package.json', async () => {
      const pkgJson = await getCapsulePackageJson(await loadProcess(workspacePath), workspacePath, 'comp1');
      expect(pkgJson.peerDependencies).to.deep.equal({ [`@${remote}/comp2`]: '^0.0.1-new' });
    });
    describe('peer dependency is not broken after snap', () => {
      before(async () => {
        await (await loadProcess(workspacePath)).snapping.snap({ build: false });
      });
      it('should save the peer dependency in the model', async () => {
        const output = await (await loadProcess(workspacePath)).show(`${remote}/comp1`);
        const peerDepData = output.peerDependencies[0];
        expectStartsWith(peerDepData.id, `${remote}/comp2`);
        expectStartsWith(peerDepData.packageName, `@${remote}/comp2`);
        expectStartsWith(peerDepData.versionRange, '^0.0.0-');
        const peerDep = getDepResolverExt(output).data.dependencies[0];
        expect(peerDep.packageName).to.eq(`@${remote}/comp2`);
        expect(peerDep.lifecycle).to.eq('peer');
        expectStartsWith(peerDep.versionRange, '^0.0.0-');
      });
      it('should save the peer dependency in the scope data', async () => {
        const comp = await (await loadProcess(workspacePath)).catComponent('comp1@latest');
        const peerDep = getDepResolverExt(comp).data.dependencies[0];
        expect(peerDep.packageName).to.eq(`@${remote}/comp2`);
        expect(peerDep.lifecycle).to.eq('peer');
        expect(peerDep.versionRange).to.eq('^0.0.1-new');
      });
      it('should save the always peer fields in the scope data', async () => {
        const comp = await (await loadProcess(workspacePath)).catComponent('comp2@latest');
        const depResolver = getDepResolverExt(comp);
        expect(depResolver.config.peer).to.eq(true);
        expect(depResolver.config.defaultPeerRange).to.eq('^');
      });
      it('adds peer dependency to the generated package.json', async () => {
        const pkgJson = await getCapsulePackageJson(await loadProcess(workspacePath), workspacePath, 'comp1', {
          fromModel: true,
        });
        expect(pkgJson.peerDependencies).to.deep.equal({ [`@${remote}/comp2`]: '^0.0.1-new' });
      });
    });
  });
});

describe('set-peer for existing component', function () {
  this.timeout(0);

  describe('a component is a peer dependency', () => {
    let workspaceData: WorkspaceData;
    let workspacePath: string;
    let remote: string;
    before(async () => {
      workspaceData = mockWorkspace();
      ({ workspacePath, remoteScopeName: remote } = workspaceData);
      await mockComponents(workspacePath, { numOfComponents: 2 });
      await (await loadProcess(workspacePath)).snapping.snap({ build: false });
      await (await loadProcess(workspacePath)).dependencies.setPeer('comp2', '0');
      await link(await loadProcess(workspacePath));
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should save the peer dependency in the model', async () => {
      const proc = await loadProcess(workspacePath);
      const { head } = await proc.catComponent('comp2');
      const output = await proc.show(`${remote}/comp1`);
      expect(output.peerDependencies[0]).to.deep.equal({
        id: `${remote}/comp2@${head}`,
        relativePaths: [],
        packageName: `@${remote}/comp2`,
        versionRange: '0',
      });
      const peerDep = getDepResolverExt(output).data.dependencies[0];
      expect(peerDep.packageName).to.eq(`@${remote}/comp2`);
      expect(peerDep.lifecycle).to.eq('peer');
      expect(peerDep.version).to.eq(head);
      expect(peerDep.versionRange).to.eq('0');
    });
    it('adds peer dependency to the generated package.json', async () => {
      const pkgJson = await getCapsulePackageJson(await loadProcess(workspacePath), workspacePath, 'comp1');
      expect(pkgJson.peerDependencies).to.deep.equal({ [`@${remote}/comp2`]: '0' });
    });
  });
});

describe('unset-peer for existing component', function () {
  this.timeout(0);

  describe('a component peer status is removed after snap', () => {
    let workspaceData: WorkspaceData;
    let workspacePath: string;
    let remote: string;
    before(async () => {
      workspaceData = mockWorkspace();
      ({ workspacePath, remoteScopeName: remote } = workspaceData);
      await mockComponents(workspacePath, { numOfComponents: 2 });
      await (await loadProcess(workspacePath)).dependencies.setPeer('comp2', '0');
      await link(await loadProcess(workspacePath));
      // caches comp2 as peer dep of comp1
      await (await loadProcess(workspacePath)).snapping.snap({ build: false });
      await (await loadProcess(workspacePath)).dependencies.unsetPeer('comp2');
      await link(await loadProcess(workspacePath));
    });
    after(async () => {
      await destroyWorkspace(workspaceData);
    });
    it('should not have comp2 as a peer dependency in the model', async () => {
      const output = await (await loadProcess(workspacePath)).show(`${remote}/comp1`);
      expect(output.peerDependencies).to.deep.equal([]);
    });
    it('should have comp2 as a runtime dependency', async () => {
      const output = await (await loadProcess(workspacePath)).show(`${remote}/comp1`);
      const dep = getDepResolverExt(output).data.dependencies.find(
        (d: { packageName: string }) => d.packageName === `@${remote}/comp2`
      );
      expect(dep).to.not.be.undefined;
      expect(dep.lifecycle).to.eq('runtime');
    });
  });
});
