import { ReleaseType } from 'semver';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { Component } from '@teambit/component';
import { StagedConfig } from '@teambit/scope';
import { AutoTagResult } from '@teambit/workspace';
import { SnappingMain, TagDataPerComp } from './snapping.main.runtime';
import { BasicTagParams, VersionMaker } from './version-maker';

/**
 * @deprecated use VersionMaker class instead
 */
export async function tagModelComponent({
  snapping,
  consumerComponents,
  components,
  ids,
  ...params
}: {
  snapping: SnappingMain;
  components: Component[];
  consumerComponents: ConsumerComponent[];
  ids: ComponentIdList;
  tagDataPerComp?: TagDataPerComp[];
  populateArtifactsFrom?: ComponentID[];
  populateArtifactsIgnorePkgJson?: boolean;
  copyLogFromPreviousSnap?: boolean;
  exactVersion?: string | null | undefined;
  releaseType?: ReleaseType;
  incrementBy?: number;
  isSnap?: boolean;
  packageManagerConfigRootDir?: string;
  exitOnFirstFailedTask?: boolean;
  updateDependentsOnLane?: boolean;
  setHeadAsParent?: boolean;
} & BasicTagParams): Promise<{
  taggedComponents: ConsumerComponent[];
  autoTaggedResults: AutoTagResult[];
  publishedPackages: string[];
  stagedConfig?: StagedConfig;
  removedComponents?: ComponentIdList;
}> {
  const versionMaker = new VersionMaker(snapping, components, consumerComponents, ids, params);
  return versionMaker.makeVersion();
}
