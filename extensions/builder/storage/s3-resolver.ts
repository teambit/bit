import { Component } from '@teambit/component';
import { StorageResolver } from './storage-resolver';
import type { Artifact } from '../artifact';

export class S3Resolver implements StorageResolver {
  name: 'default';
  // todo artifact map
  async store(component: Component, artifacts: Artifact[]) {
    // const artifactsGrouped = this.groupArtifactsByTaskId(artifacts);
    // Object.keys(artifactsGrouped).forEach((taskId) => {
    //   const aspectEntry = this.getAspectEntry(component, taskId);
    //   aspectEntry.artifacts = this.transformToVinyl(artifactsGrouped[taskId]);
    // });
  }
}
