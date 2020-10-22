import { EnvService, ExecutionContext } from '@teambit/environments';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';
import { Component } from '@teambit/component';
import { BuildPipe } from './build-pipe';
import { TaskResultsList } from './task-results-list';
import { TaskSlot } from './builder.main.runtime';
import { BuildContext } from './build-task';
import { ArtifactFactory } from './artifact';
import { figureOrder } from './build-pipeline-order';

export type BuildServiceResults = {
  id: string;
  buildResults: TaskResultsList;
  components: Component[];
  errors?: [];
};

export type EnvsBuildContext = { [envId: string]: BuildContext };

export class BuilderService implements EnvService<BuildServiceResults> {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace,

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

    private artifactFactory: ArtifactFactory
  ) {}

  /**
   * runs all tasks for all envs
   */
  async runOnce(envsExecutionContext: ExecutionContext[]): Promise<TaskResultsList> {
    const envs = envsExecutionContext.map((executionContext) => executionContext.envRuntime);
    const tasksQueue = figureOrder(this.taskSlot, envs, this.pipeNameOnEnv);
    const title = `running ${this.displayPipeName} pipe for ${envs.length} environments, total ${tasksQueue.length} tasks`;
    const longProcessLogger = this.logger.createLongProcessLogger(title);
    this.logger.consoleTitle(title);
    const envsBuildContext: EnvsBuildContext = {};
    await Promise.all(
      envsExecutionContext.map(async (executionContext) => {
        const componentIds = executionContext.components.map((component) => component.id.toString());
        const buildContext = Object.assign(executionContext, {
          capsuleGraph: await this.workspace.createNetwork(componentIds, { getExistingAsIs: true }),
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
}
