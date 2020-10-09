import { ComponentID, ComponentMap, Component } from '@teambit/component';
import { flatten, isEmpty } from 'ramda';
import { compact } from 'ramda-adjunct';
import type { ArtifactObject } from 'bit-bin/dist/consumer/component/sources/artifact-files';
import { Artifact, ArtifactList } from './artifact';
import { BuildPipeResults, TaskResults } from './build-pipe';
import { Serializable, TaskMetadata } from './types';

type PipelineReport = {
  taskId: string;
  taskName?: string;
  taskDescription?: string;
  startTime?: number;
  endTime?: number;
  errors?: Array<Error | string>;
  warnings?: string[];
};

export class BuildPipelineResultList {
  private flattenedTasksResults: TaskResults[];
  private artifactListsMap: ComponentMap<ArtifactList>;
  constructor(private buildPipeResults: BuildPipeResults[], private components: Component[]) {
    this.flattenedTasksResults = this.getFlattenedTaskResultsFromAllEnvs();
    this.artifactListsMap = this.getFlattenedArtifactListsMapFromAllTasks();
  }

  private getFlattenedTaskResultsFromAllEnvs(): TaskResults[] {
    return flatten(this.buildPipeResults.map((buildPipeResult) => buildPipeResult.tasksResults));
  }

  private getFlattenedArtifactListsMapFromAllTasks(): ComponentMap<ArtifactList> {
    const artifactListsMaps: ComponentMap<ArtifactList>[] = this.flattenedTasksResults.map(
      (taskResult) => taskResult.artifacts
    );
    return ComponentMap.as<ArtifactList>(this.components, (component) => {
      const artifacts: Artifact[] = [];
      artifactListsMaps.forEach((artifactListMap) => {
        const artifactList = artifactListMap.getValueByComponentId(component.id);
        if (artifactList) artifacts.push(...artifactList.toArray());
      });
      return new ArtifactList(artifacts);
    });
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

  public getPipelineReportOfComponent(componentId: ComponentID): PipelineReport[] {
    const compResults = this.flattenedTasksResults.map((taskResults: TaskResults) => {
      const foundComponent = taskResults.componentsResults.find((c) => c.component.id.isEqual(componentId));
      if (!foundComponent) return null;
      const pipelineReport: PipelineReport = {
        taskId: taskResults.task.id,
        taskName: taskResults.task.name,
        taskDescription: taskResults.task.description,
        errors: foundComponent.errors,
        warnings: foundComponent.warnings,
        startTime: foundComponent.startTime,
        endTime: foundComponent.endTime,
      };
      return pipelineReport;
    });
    return compact(compResults);
  }

  public getArtifactsDataOfComponent(componentId: ComponentID): ArtifactObject[] | undefined {
    return this.artifactListsMap.getValueByComponentId(componentId)?.toObject();
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
}
