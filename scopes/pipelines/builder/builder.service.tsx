import { EnvDefinition, EnvService, ExecutionContext } from '@teambit/envs';
import React from 'react';
import { ScopeMain } from '@teambit/scope';
import { Text, Newline } from 'ink';
import { Logger } from '@teambit/logger';
import { IsolatorMain } from '@teambit/isolator';
import { Component } from '@teambit/component';
import { BuildPipe } from './build-pipe';
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

export type BuilderServiceOptions = { seedersOnly?: boolean; tasks?: string[]; skipTests?: boolean };

export type BuilderDescriptor = { tasks: string[] };

export type EnvsBuildContext = { [envId: string]: BuildContext };

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
     * for now, it can be either "getBuildPipe" or "getDeployPipe".
     * a method with such name should be implemented on the env in order to run the pipe tasks.
     */
    private pipeNameOnEnv: string,

    /**
     * pipe name to display on the console during the execution
     */
    private displayPipeName: string,
    private artifactFactory: ArtifactFactory,
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
        const capsuleNetwork = await this.isolator.isolateComponents(componentIds, {
          getExistingAsIs: true,
          seedersOnly: options.seedersOnly,
        });
        this.logger.console(
          `generated graph for env "${executionContext.id}", seeders total: ${capsuleNetwork.seedersCapsules.length}, graph total: ${capsuleNetwork.graphCapsules.length}`
        );
        const buildContext = Object.assign(executionContext, {
          capsuleNetwork,
        });
        envsBuildContext[executionContext.id] = buildContext;
      })
    );
    const buildPipe = BuildPipe.from(tasksQueue, envsBuildContext, this.logger, this.artifactFactory);
    const buildResults = await buildPipe.execute();
    longProcessLogger.end();
    buildResults.hasErrors() ? this.logger.consoleFailure() : this.logger.consoleSuccess();

    return buildResults;
  }

  render(env: EnvDefinition) {
    const tasksQueue = this.getDescriptor(env);

    return (
      <Text key={BuilderAspect.id}>
        <Text color="cyan">
          total {tasksQueue.tasks.length} tasks are configured to be executed in the following order
        </Text>
        <Newline />
        {tasksQueue.tasks.map((task, index) => (
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
    const tasksQueue = calculatePipelineOrder(this.taskSlot, [env], this.pipeNameOnEnv);
    return { tasks: tasksQueue.map(({ task }) => BuildTaskHelper.serializeId(task)) };
  }
}
