import { expect } from 'chai';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { Dependencies, Dependency } from '@teambit/legacy.consumer-component';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { updateDependenciesVersions } from './dependencies-versions-resolver';

const linkPkg = '@my-scope/navigation.link';
const linkId = ComponentID.fromString('my-scope/navigation/link');

/**
 * a component with a component peer that its env sets with a range (the range is set before, by ApplyOverrides).
 * the last snap of the component has the peer in version 2.0.1.
 */
async function resolvePeerVersion({
  range,
  inBitmap = false,
  forced,
  workspacePolicy,
  debugDependencies,
}: {
  range: string;
  inBitmap?: boolean;
  forced?: string;
  workspacePolicy?: string;
  debugDependencies?: any[];
}): Promise<string | undefined> {
  const peer = new Dependency(linkId.changeVersion('2.0.1'), [], linkPkg, range);
  const component: any = {
    id: ComponentID.fromString('my-scope/card@0.0.1'),
    dependencies: new Dependencies(),
    devDependencies: new Dependencies(),
    peerDependencies: new Dependencies([peer]),
    overrides: { getComponentDependenciesWithVersion: () => ({}) },
    componentFromModel: { getAllDependenciesIds: () => ComponentIdList.fromArray([linkId.changeVersion('2.0.1')]) },
  };
  const workspace: any = {
    getAutoDetectConfigMerge: () => undefined,
    getCurrentLaneObject: async () => undefined,
    consumer: {
      bitmapIdsFromCurrentLane: ComponentIdList.fromArray(inBitmap ? [linkId.changeVersion('2.0.5')] : []),
      bitMap: { getRemoved: () => new ComponentIdList() },
    },
  };
  const depsResolver = {
    calcComponentRangePrefixByConsumerComponent: () => (workspacePolicy ? '^' : undefined),
    getWorkspacePolicyManifest: () => ({ dependencies: workspacePolicy ? { [linkPkg]: workspacePolicy } : {} }),
  } as unknown as DependencyResolverMain;
  const overridesDependencies: any = {
    envOwnPkgNames: new Set(),
    getDependenciesToAddManually: () => (forced ? { peerDependencies: { [linkPkg]: forced } } : undefined),
  };
  await updateDependenciesVersions(
    depsResolver,
    workspace,
    component,
    overridesDependencies,
    undefined,
    debugDependencies,
    false
  );
  return component.peerDependencies.get()[0].id.version;
}

describe('updateDependenciesVersions, a component peer with a range from a policy', () => {
  it('should take the version of the range when the version found is out of the range', async () => {
    expect(await resolvePeerVersion({ range: '^2.0.3' })).to.equal('2.0.3');
  });
  it('should show the version of the range in the dependencies debug', async () => {
    const debugDependencies = [{ id: linkId.changeVersion('2.0.1') }];
    await resolvePeerVersion({ range: '^2.0.3', debugDependencies });
    expect(debugDependencies[0]).to.include({
      version: '2.0.3',
      versionResolvedFrom: 'Model (out of the range ^2.0.3)',
    });
  });
  it('should keep the version found when it is in the range', async () => {
    expect(await resolvePeerVersion({ range: '^2.0.0' })).to.equal('2.0.1');
  });
  it('should keep the version of a workspace component', async () => {
    expect(await resolvePeerVersion({ range: '^2.0.3', inBitmap: true })).to.equal('2.0.5');
  });
  it('should keep a forced version', async () => {
    expect(await resolvePeerVersion({ range: '^2.0.3', forced: '2.0.2' })).to.equal('2.0.2');
  });
  it('should check the version against the range of the workspace policy when it replaces the range', async () => {
    expect(await resolvePeerVersion({ range: '^2.0.3', workspacePolicy: '^2.0.0' })).to.equal('2.0.1');
  });
  it('should keep the version found when the range has no version in it', async () => {
    expect(await resolvePeerVersion({ range: '<2.0.0' })).to.equal('2.0.1');
  });
});

const envId = ComponentID.fromString('my-scope/my-env');
const envPkg = '@my-scope/my-env';
const laneVersion = 'abc1234567890abcdef1234567890abcdef12345';

/**
 * a component on a lane. its last snap depends on the env (as a dependency and as an extension) in the given version.
 * when "removed", the env was deleted from the lane ("bit delete --lane"), so it's in .bitmap as removed.
 * when "installed", the env is installed in version 2.0.7 (and the component config sets the env with this version).
 */
async function resolveEnvVersion({
  modelVersion,
  removed,
  installed,
}: {
  modelVersion: string;
  removed: boolean;
  installed: boolean;
}) {
  const installedId = installed ? envId.changeVersion('2.0.7') : envId;
  const dependency = new Dependency(installedId, [], envPkg);
  const extension: any = { extensionId: installedId };
  const component: any = {
    id: ComponentID.fromString('my-scope/card@0.0.1'),
    dependencies: new Dependencies([dependency]),
    devDependencies: new Dependencies(),
    peerDependencies: new Dependencies(),
    extensions: [extension],
    overrides: { getComponentDependenciesWithVersion: () => ({}) },
    componentFromModel: {
      getAllDependenciesIds: () => ComponentIdList.fromArray([envId.changeVersion(modelVersion)]),
    },
  };
  const workspace: any = {
    getAutoDetectConfigMerge: () => undefined,
    getCurrentLaneObject: async () => undefined,
    consumer: {
      bitmapIdsFromCurrentLane: new ComponentIdList(),
      bitMap: { getRemoved: () => ComponentIdList.fromArray(removed ? [envId.changeVersion(laneVersion)] : []) },
    },
  };
  const depsResolver = {
    calcComponentRangePrefixByConsumerComponent: () => undefined,
    getWorkspacePolicyManifest: () => ({ dependencies: {} }),
  } as unknown as DependencyResolverMain;
  const overridesDependencies: any = { envOwnPkgNames: new Set(), getDependenciesToAddManually: () => undefined };
  await updateDependenciesVersions(depsResolver, workspace, component, overridesDependencies);
  return {
    dependencyVersion: component.dependencies.get()[0].id.version,
    extensionVersion: extension.extensionId.version,
  };
}

describe('updateDependenciesVersions, a dependency that was deleted from the workspace', () => {
  it('should prefer the installed or configured version over the version of the last snap', async () => {
    const result = await resolveEnvVersion({ modelVersion: laneVersion, removed: true, installed: true });
    expect(result).to.deep.equal({ dependencyVersion: '2.0.7', extensionVersion: '2.0.7' });
  });
  it('should do the same when the deleted component was snapped again, so its version is different', async () => {
    const result = await resolveEnvVersion({ modelVersion: '2.0.5', removed: true, installed: true });
    expect(result).to.deep.equal({ dependencyVersion: '2.0.7', extensionVersion: '2.0.7' });
  });
  it('should fall back to the version of the last snap when there is no other version', async () => {
    const result = await resolveEnvVersion({ modelVersion: laneVersion, removed: true, installed: false });
    expect(result).to.deep.equal({ dependencyVersion: laneVersion, extensionVersion: laneVersion });
  });
  it('should keep the version of the last snap when the dependency was not deleted', async () => {
    const result = await resolveEnvVersion({ modelVersion: '2.0.5', removed: false, installed: true });
    expect(result).to.deep.equal({ dependencyVersion: '2.0.5', extensionVersion: '2.0.5' });
  });
});
