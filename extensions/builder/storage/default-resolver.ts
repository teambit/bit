import fs from 'fs-extra';
import path from 'path';
import { ArtifactVinyl } from 'bit-bin/dist/consumer/component/sources/artifact';
import { AspectEntry, Component, ComponentID } from '@teambit/component';
import { StorageResolver } from './storage-resolver';
import type { Artifact } from '../artifact';

export class DefaultResolver implements StorageResolver {
  name: 'default';
  // todo artifact map
  async store(component: Component, artifacts: Artifact[]) {
    artifacts.forEach((artifact) => {
      const aspectEntry = this.getAspectEntry(component, artifact.task.id);
      const artifactsVinyl = artifact.paths.map(
        (file) => new ArtifactVinyl({ path: file, contents: fs.readFileSync(path.join(artifact.rootDir, file)) })
      );
      aspectEntry.artifacts.push(...artifactsVinyl);
    });
  }

  private getAspectEntry(component: Component, aspectId: string): AspectEntry {
    const existing = component.state.aspects.get(aspectId);
    if (existing) return existing;
    const id = ComponentID.fromString(aspectId);
    const entry = component.state.aspects.addEntry(id);
    return entry;
  }
}
