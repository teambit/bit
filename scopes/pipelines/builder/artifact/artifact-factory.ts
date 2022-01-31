import { join } from 'path';
import globby from 'globby';
import { flatten } from 'lodash';
import { ArtifactFiles } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { Component, ComponentMap } from '@teambit/component';
import { ArtifactDefinition } from './artifact-definition';
import { DefaultResolver } from '../storage';
import { ArtifactList } from './artifact-list';
import { Artifact } from './artifact';
import type { BuildContext, BuildTask } from '../build-task';
import { CapsuleNotFound } from '../exceptions';

export const DEFAULT_CONTEXT = 'component';

export type ArtifactMap = ComponentMap<ArtifactList>;

export class ArtifactFactory {
  resolvePaths(root: string, def: ArtifactDefinition): string[] {
    const patternsFlattened = flatten(def.globPatterns);
    const paths = globby.sync(patternsFlattened, { cwd: root });
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
  ): Artifact | undefined {
    const storageResolver = this.getStorageResolver(def);
    const contextPath = this.getArtifactContextPath(context, component, def);
    const rootDir = this.getRootDir(contextPath, def);
    const paths = this.resolvePaths(rootDir, def);
    if (!paths || !paths.length) {
      return undefined;
    }
    return new Artifact(def, storageResolver, new ArtifactFiles(paths), rootDir, task);
  }

  private getStorageResolver(def: ArtifactDefinition) {
    return def.storageResolver || new DefaultResolver();
  }

  private toComponentMap(context: BuildContext, artifactMap: [string, Artifact][]) {
    return ComponentMap.as<ArtifactList>(context.components, (component) => {
      const id = component.id.toString();
      const artifacts = artifactMap.filter(([targetId]) => targetId === id).map(([, artifact]) => artifact);

      return new ArtifactList(artifacts);
    });
  }

  getRootDir(rootDir: string, def: ArtifactDefinition) {
    if (!def.rootDir) return rootDir;
    return join(rootDir, def.rootDir);
  }

  /**
   * generate artifacts from a build context according to the spec defined in the artifact definitions.
   */
  generate(context: BuildContext, defs: ArtifactDefinition[], task: BuildTask): ComponentMap<ArtifactList> {
    const tupleArr: [string, Artifact][] = [];

    defs.forEach((def) => {
      const artifactContext = this.getArtifactContext(def);
      if (artifactContext === 'env') {
        const capsuleDir = context.capsuleNetwork.capsulesRootDir;
        const rootDir = this.getRootDir(capsuleDir, def);
        const paths = this.resolvePaths(rootDir, def);
        if (paths && paths.length) {
          const artifact = new Artifact(
            def,
            this.getStorageResolver(def),
            new ArtifactFiles(this.resolvePaths(rootDir, def)),
            rootDir,
            task
          );

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
