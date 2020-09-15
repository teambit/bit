import { Component, ComponentID } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { Artifact } from 'bit-bin/dist/consumer/component/sources/artifact';
import { ExtensionDataEntry } from 'bit-bin/dist/consumer/config/extension-data';
import { flatten, isEmpty } from 'ramda';
import { BuildPipeResults, TaskResults } from './build-pipe';
import { Serializable, TaskMetadata } from './types';

export class BuildPipelineResultList {
  private flattenedTasksResults: TaskResults[];
  constructor(private buildPipeResults: BuildPipeResults[]) {
    this.flattenedTasksResults = this.getFlattenedTaskResultsFromAllEnvs();
  }

  private getFlattenedTaskResultsFromAllEnvs(): TaskResults[] {
    return flatten(this.buildPipeResults.map((buildPipeResult) => buildPipeResult.results));
  }

  public getMetadataFromTaskResults(componentId: ComponentID): { [taskId: string]: TaskMetadata } {
    const compResults = this.flattenedTasksResults.reduce((acc, current: TaskResults) => {
      const foundComponent = current.componentsResults.find((c) => c.component.id.isEqual(componentId));
      const taskId = current.task.id;
      if (foundComponent && foundComponent.metadata) {
        acc[taskId] = this.mergeDataIfPossible(foundComponent.metadata, acc[taskId], taskId);
      }
      return acc;
    }, {});
    return compResults;
  }

  private mergeDataIfPossible(currentData: Serializable, existingData: Serializable | undefined, taskId: string) {
    if (!existingData || isEmpty(existingData)) return currentData;
    // both exist
    if (typeof currentData !== 'object') {
      throw new Error(`task data must be "object", get ${typeof currentData} for ${taskId}`);
    }
    if (Array.isArray(currentData)) {
      throw new Error(`task data must be "object", get Array for ${taskId}`);
    }
    return { ...currentData, ...existingData };
  }

  // rename artifact here to files.
  // public async saveBuildResults(): Promise<Component[]> {
  //   const { components } = this.buildPipeResults;
  //   const resultsP = components.map(async (component) => {
  //     this.saveDataToComponent(component);
  //     // await this.saveArtifactsToComponent(component, files);
  //   });
  //   await Promise.all(resultsP);
  //   return components;
  // }

  // private saveDataToComponent(component: Component) {
  //   // @todo: fix to use isEqual of ComponentId, not the legacy. currently it's not working
  //   // due to defaultScope discrepancies.
  //   const componentResult = this.taskResult.componentsResults.find((c) =>
  //     c.component.id._legacy.isEqual(component.id._legacy)
  //   );
  //   const data = componentResult && componentResult.metadata;
  //   if (data) {
  //     const extensionDataEntry = this.getExtensionDataEntry(component);
  //     extensionDataEntry.data = this.mergeDataIfPossible(data, extensionDataEntry.data);
  //   }
  // }

  // private getExtensionDataEntry(component: Component): ExtensionDataEntry {
  //   const existingExtensionDataEntry =
  //     component.config.extensions.findCoreExtension(this.task.id) ||
  //     component.config.extensions.findExtension(this.task.id);
  //   if (existingExtensionDataEntry) return existingExtensionDataEntry;
  //   const extensionDataEntry = new ExtensionDataEntry(undefined, undefined, this.task.id);
  //   component.config.extensions.push(extensionDataEntry);
  //   return extensionDataEntry;
  // }

  // private async getFilesByArtifacts(capsule: Capsule, artifacts: Artifact[]): Promise<string[]> {
  //   const filesP = artifacts.map(async (artifact) => {
  //     if (artifact.fileName) return artifact.fileName;
  //     return capsule.getAllFilesPaths(artifact.dirName);
  //   });
  //   return flatten(await Promise.all(filesP));
  // }
}
