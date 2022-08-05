import { EnvDefinition, EnvService, ExecutionContext } from '@teambit/envs';
import React from 'react';
import { ScopeMain } from '@teambit/scope';
import { Text, Newline } from 'ink';
import { Logger } from '@teambit/logger';
import { IsolatorMain } from '@teambit/isolator';
import { Component, ComponentID } from '@teambit/component';
import { BuildPipe, TaskResults } from './build-pipe';
import { TaskResultsList } from './task-results-list';
import { TaskSlot } from './builder.main.runtime';
import { BuildContext, BuildTaskHelper } from './build-task';
import { ArtifactFactory } from './artifact';
import { calculatePipelineOrder } from './build-pipeline-order';
import { BuilderAspect } from './builder.aspect';

export type BuildServiceResults = {
  id: string;
  buildResults: TaskResultsList;
  components: Component[];
  errors?: [];
};

export type BuilderServiceOptions = {
  seedersOnly?: boolean;
  originalSeeders?: ComponentID[];
  tasks?: string[];
  skipTests?: boolean;
  previousTasksResults?: TaskResults[];
  dev?: boolean;
};

export type EnvsBuildContext = { [envId: string]: BuildContext };

const pipeNames = {
  getBuildPipe: 'build',
  getTagPipe: 'tag',
  getSnapPipe: 'snap',
};

type PipeName = 'build' | 'tag' | 'snap';

export type BuilderDescriptor = Array<{ pipeName: PipeName; tasks: string[] }>;

type PipeFunctionNames = keyof typeof pipeNames;
export class BuilderService implements EnvService<BuildServiceResults, BuilderDescriptor> {
  name = 'builder';

  constructor(
    /**
     * isolator extension.
     */
    private isolator: IsolatorMain,

    /**
     * logger extension.
     */
    private logger: Logger,

    /**
     * task slot (e.g tasks registered by other extensions.).
     */
    private taskSlot: TaskSlot,

    /**
     * a method with such name should be implemented on the env in order to run the pipe tasks.
     */
    private pipeNameOnEnv: PipeFunctionNames,

    /**
     * pipe name to display on the console during the execution
     */
    private displayPipeName: string,
    private scope: ScopeMain
  ) {}

  /**
   * runs all tasks for all envs
   */
  async runOnce(envsExecutionContext: ExecutionContext[], options: BuilderServiceOptions): Promise<TaskResultsList> {
    const envs = envsExecutionContext.map((executionContext) => executionContext.envDefinition);
    const tasksQueue = calculatePipelineOrder(
      this.taskSlot,
      envs,
      this.pipeNameOnEnv,
      options.tasks,
      options.skipTests
    );
    tasksQueue.validate();
    this.logger.info(`going to run tasks in the following order:\n${tasksQueue.toString()}`);
    const title = `running ${this.displayPipeName} pipe for ${envs.length} environments, total ${tasksQueue.length} tasks`;
    const longProcessLogger = this.logger.createLongProcessLogger(title);
    this.logger.consoleTitle(title);
    const envsBuildContext: EnvsBuildContext = {};
    await Promise.all(
      envsExecutionContext.map(async (executionContext) => {
        const componentIds = executionContext.components.map((component) => component.id);
        const { originalSeeders } = options;
        const originalSeedersOfThisEnv = componentIds.filter((compId) =>
          originalSeeders ? originalSeeders.find((seeder) => compId.isEqual(seeder)) : true
        );
        const capsuleNetwork = await this.isolator.isolateComponents(componentIds, {
          getExistingAsIs: true,
          seedersOnly: options.seedersOnly,
        });
        capsuleNetwork._originalSeeders = originalSeedersOfThisEnv;
        this.logger.console(
          `generated graph for env "${executionContext.id}", originalSeedersOfThisEnv: ${originalSeedersOfThisEnv.length}, graphOfThisEnv: ${capsuleNetwork.seedersCapsules.length}, graph total: ${capsuleNetwork.graphCapsules.length}`
        );
        const buildContext = Object.assign(executionContext, {
          capsuleNetwork,
          previousTasksResults: [],
          dev: options.dev,
        });
        envsBuildContext[executionContext.id] = buildContext;
      })
    );
    const buildPipe = BuildPipe.from(
      tasksQueue,
      envsBuildContext,
      this.logger,
      this.artifactFactory,
      options.previousTasksResults
    );
    const buildResults = await buildPipe.execute();
    longProcessLogger.end();
    buildResults.hasErrors() ? this.logger.consoleFailure() : this.logger.consoleSuccess();

    return buildResults;
  }

  render(env: EnvDefinition) {
    const pipes = this.getDescriptor(env);

    return (
      <Text key={BuilderAspect.id}>{pipes.map(({ pipeName, tasks }) => this.renderOnePipe(pipeName, tasks))}</Text>
    );
  }

  private renderOnePipe(pipeName, tasks) {
    if (!tasks || !tasks.length) return null;
    return (
      <Text key={pipeName}>
        <Text underline color="green">
          {pipeName} pipe
        </Text>
        <Newline />
        <Text color="cyan">total {tasks.length} tasks are configured to be executed in the following order</Text>
        <Newline />
        {tasks.map((task, index) => (
          <Text key={index}>
            <Text>
              {index + 1}. {task}
            </Text>
            <Newline />
          </Text>
        ))}
        <Newline />
      </Text>
    );
  }

  getDescriptor(env: EnvDefinition) {
    // @ts-ignore
    const tasks = Object.keys(pipeNames).map((pipeFuncName: PipeFunctionNames) => {
      const tasksQueue = this.getTasksNamesByPipeFunc(env, pipeFuncName);
      return { pipeName: pipeNames[pipeFuncName], tasks: tasksQueue };
    });
    return tasks as BuilderDescriptor;
  }

  private getTasksNamesByPipeFunc(env: EnvDefinition, pipeFuncName: PipeFunctionNames): string[] {
    const tasksQueue = calculatePipelineOrder(this.taskSlot, [env], pipeFuncName).map(({ task }) =>
      BuildTaskHelper.serializeId(task)
    );
    return tasksQueue;
  }

  getCurrentPipeTasks(env: EnvDefinition) {
    return this.getTasksNamesByPipeFunc(env, this.pipeNameOnEnv);
  }
}
