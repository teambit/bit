import { ComponentID } from '@teambit/component';
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
}
