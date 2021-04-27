import { ComponentID, ComponentMap, Component } from '@teambit/component';
import { isEmpty } from 'ramda';
import { compact } from 'lodash';
import type { ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { Artifact, ArtifactList } from './artifact';
import { TaskResults } from './build-pipe';
import { Serializable, TaskMetadata } from './types';

export type PipelineReport = {
  taskId: string;
  taskName?: string;
  taskDescription?: string;
  startTime?: number;
  endTime?: number;
  errors?: Array<Error | string>;
  warnings?: string[];
};

export type AspectData = {
  aspectId: string;
  data: Serializable;
};

/**
 * Helper to get the data and artifacts from the TasksResultsList before saving during the tag
 */
export class BuildPipelineResultList {
  private artifactListsMap: ComponentMap<ArtifactList>;
  constructor(private tasksResults: TaskResults[], private components: Component[]) {
    this.artifactListsMap = this.getFlattenedArtifactListsMapFromAllTasks();
  }

  private getFlattenedArtifactListsMapFromAllTasks(): ComponentMap<ArtifactList> {
    const artifactListsMaps = this.tasksResults.flatMap((t) => (t.artifacts ? [t.artifacts] : []));
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
    const compResults = this.tasksResults.reduce((acc, current: TaskResults) => {
      const foundComponent = current.componentsResults.find((c) => c.component.id.isEqual(componentId));
      const taskId = current.task.aspectId;
      if (foundComponent && foundComponent.metadata) {
        acc[taskId] = this.mergeDataIfPossible(foundComponent.metadata, acc[taskId], taskId);
      }
      return acc;
    }, {});
    return compResults;
  }

  public getPipelineReportOfComponent(componentId: ComponentID): PipelineReport[] {
    const compResults = this.tasksResults.map((taskResults: TaskResults) => {
      const foundComponent = taskResults.componentsResults.find((c) => c.component.id.isEqual(componentId));
      if (!foundComponent) return null;
      const pipelineReport: PipelineReport = {
        taskId: taskResults.task.aspectId,
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

  public getDataOfComponent(componentId: ComponentID): AspectData[] {
    const tasksData = this.getMetadataFromTaskResults(componentId);
    return Object.keys(tasksData).map((taskId) => ({
      aspectId: taskId,
      data: tasksData[taskId],
    }));
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
