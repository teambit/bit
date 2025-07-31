import { join } from 'path';
import globby from 'globby';
import { flatten } from 'lodash';
import { ArtifactFiles } from '@teambit/component.sources';
import type { Component } from '@teambit/component';
import { ComponentMap } from '@teambit/component';
import type { PathLinux } from '@teambit/legacy.utils';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import type { ArtifactDefinition } from './artifact-definition';
import { DefaultResolver } from '../storage';
import { ArtifactList } from './artifact-list';
import type { BuildContext, BuildTask } from '../build-task';
import { CapsuleNotFound } from '../exceptions';
import { FsArtifact } from './fs-artifact';

export const DEFAULT_CONTEXT = 'component';

export type ArtifactMap = ComponentMap<ArtifactList<FsArtifact>>;

export class ArtifactFactory {
  resolvePaths(root: string, def: ArtifactDefinition): string[] {
    const patternsFlattened = flatten(def.globPatterns);
    const patternsFlattenedLinux: PathLinux[] = patternsFlattened.map(pathNormalizeToLinux);
    const paths = globby.sync(patternsFlattenedLinux, { cwd: root });
    return paths;
  }

  private getArtifactContextPath(context: BuildContext, component: Component, def: ArtifactDefinition) {
    const artifactContext = this.getArtifactContext(def);
    if (artifactContext === 'component') {
      const capsulePath = context.capsuleNetwork.graphCapsules.getCapsule(component.id)?.path;
      if (!capsulePath) throw new CapsuleNotFound(component.id);
      return capsulePath;
    }

    return context.capsuleNetwork.capsulesRootDir;
  }

  private getArtifactContext(def: ArtifactDefinition) {
    return def.context || DEFAULT_CONTEXT;
  }

  createFromComponent(
    context: BuildContext,
    component: Component,
    def: ArtifactDefinition,
    task: BuildTask
  ): FsArtifact | undefined {
    const contextPath = this.getArtifactContextPath(context, component, def);
    const rootDir = this.getRootDir(contextPath, def);
    const paths = this.resolvePaths(rootDir, def);
    if (!paths || !paths.length) {
      return undefined;
    }
    return new FsArtifact(def, new ArtifactFiles(paths), task, rootDir);
  }

  private getStorageResolver(def: ArtifactDefinition) {
    return def.storageResolver || new DefaultResolver();
  }

  private toComponentMap(context: BuildContext, artifactMap: [string, FsArtifact][]) {
    return ComponentMap.as<ArtifactList<FsArtifact>>(context.components, (component) => {
      const id = component.id.toString();
      const artifacts = artifactMap.filter(([targetId]) => targetId === id).map(([, artifact]) => artifact);

      return ArtifactList.fromArray(artifacts);
    });
  }

  getRootDir(rootDir: string, def: ArtifactDefinition) {
    if (!def.rootDir) return rootDir;
    return join(rootDir, def.rootDir);
  }

  /**
   * generate artifacts from a build context according to the spec defined in the artifact definitions.
   */
  generate(context: BuildContext, defs: ArtifactDefinition[], task: BuildTask): ComponentMap<ArtifactList<FsArtifact>> {
    const tupleArr: [string, FsArtifact][] = [];

    defs.forEach((def) => {
      const artifactContext = this.getArtifactContext(def);
      if (artifactContext === 'env') {
        const capsuleDir = context.capsuleNetwork.capsulesRootDir;
        const rootDir = this.getRootDir(capsuleDir, def);
        const paths = this.resolvePaths(rootDir, def);
        if (paths && paths.length) {
          const artifact = new FsArtifact(def, new ArtifactFiles(this.resolvePaths(rootDir, def)), task, rootDir);

          return context.components.forEach((component) => {
            tupleArr.push([component.id.toString(), artifact]);
          });
        }
      }

      return context.components.forEach((component) => {
        const artifact = this.createFromComponent(context, component, def, task);
        if (artifact) {
          tupleArr.push([component.id.toString(), artifact]);
        }
      });
    });

    return this.toComponentMap(context, tupleArr);
  }
}
