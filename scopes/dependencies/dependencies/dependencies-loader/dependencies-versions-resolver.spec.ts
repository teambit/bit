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
}: {
  range: string;
  inBitmap?: boolean;
  forced?: string;
  workspacePolicy?: string;
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
    consumer: { bitmapIdsFromCurrentLane: ComponentIdList.fromArray(inBitmap ? [linkId.changeVersion('2.0.5')] : []) },
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
    undefined,
    false
  );
  return component.peerDependencies.get()[0].id.version;
}

describe('updateDependenciesVersions, a component peer with a range from a policy', () => {
  it('should take the version of the range when the version found is out of the range', async () => {
    expect(await resolvePeerVersion({ range: '^2.0.3' })).to.equal('2.0.3');
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
