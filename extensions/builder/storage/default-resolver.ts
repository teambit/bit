import fs from 'fs-extra';
import path from 'path';
import { flatten } from 'ramda';
import { ArtifactVinyl } from 'bit-bin/dist/consumer/component/sources/artifact';
import { AspectEntry, Component, ComponentID } from '@teambit/component';
import { StorageResolver } from './storage-resolver';
import type { Artifact, ArtifactList } from '../artifact';

export class DefaultResolver implements StorageResolver {
  name = 'default';
  // todo artifact map
  async store(component: Component, artifactList: ArtifactList) {
    const artifacts = artifactList.artifacts;
    const artifactsGrouped = this.groupArtifactsByTaskId(artifacts);
    Object.keys(artifactsGrouped).forEach((taskId) => {
      const aspectEntry = this.getAspectEntry(component, taskId);
      aspectEntry.artifacts = this.transformToVinyl(artifactsGrouped[taskId]);
    });
  }

  private transformToVinyl(artifacts: Artifact[]): ArtifactVinyl[] {
    const allArtifacts = artifacts.map((artifact) => {
      const artifactsVinyl = artifact.paths.map(
        (file) => new ArtifactVinyl({ path: file, contents: fs.readFileSync(path.join(artifact.rootDir, file)) })
      );
      return artifactsVinyl;
    });
    return flatten(allArtifacts);
  }

  private groupArtifactsByTaskId(artifacts: Artifact[]): { [taskId: string]: Artifact[] } {
    return artifacts.reduce((acc, current) => {
      if (acc[current.task.id]) acc[current.task.id].push(current);
      else acc[current.task.id] = [current];
      return acc;
    }, {});
  }

  private getAspectEntry(component: Component, aspectId: string): AspectEntry {
    const existing = component.state.aspects.get(aspectId);
    if (existing) return existing;
    const id = ComponentID.fromString(aspectId);
    const entry = component.state.aspects.addEntry(id);
    return entry;
  }
}
