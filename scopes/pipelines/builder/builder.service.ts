import { CFG_CAPSULES_BUILD_COMPONENTS_BASE_DIR } from '@teambit/legacy.constants';
import type {
  EnvService,
  ExecutionContext,
  EnvDefinition,
  Env,
  EnvContext,
  ServiceTransformationMap,
} from '@teambit/envs';
import chalk from 'chalk';
import { uniq } from 'lodash';
import type { ScopeMain } from '@teambit/scope';
import pMapSeries from 'p-map-series';
import type { Logger } from '@teambit/logger';
import type { IsolatorMain } from '@teambit/isolator';
import type { Component, ComponentID } from '@teambit/component';
import type { TaskResults } from './build-pipe';
import { BuildPipe } from './build-pipe';
import type { TaskResultsList } from './task-results-list';
import type { TaskSlot } from './builder.main.runtime';
import type { BuildContext, BuildTask } from './build-task';
import { BuildTaskHelper } from './build-task';
import type { ArtifactFactory } from './artifact';
import { calculatePipelineOrder } from './build-pipeline-order';
import type { ConfigStoreMain } from '@teambit/config-store';

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
  skipTasks?: string[];
  previousTasksResults?: TaskResults[];
  dev?: boolean;
  exitOnFirstFailedTask?: boolean;
  capsulesBaseDir?: string;
  loose?: boolean; // avoid throwing errors if tasks like tests or lint fail
};

type BuilderTransformationMap = ServiceTransformationMap & {
  getBuildPipe: () => BuildTask[];
  getTagPipe: () => BuildTask[];
  getSnapPipe: () => BuildTask[];
};

export type EnvsBuildContext = { [envId: string]: BuildContext };

const pipeNames = {
  getBuildPipe: 'build',
  getTagPipe: 'tag',
  getSnapPipe: 'snap',
};

export type PipeName = 'build' | 'tag' | 'snap';

export type BuilderDescriptor = Array<{ pipeName: PipeName; tasks: string[] }>;

export type PipeFunctionNames = keyof typeof pipeNames;
export class BuilderService implements EnvService<BuildServiceResults, string> {
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
    private displayPipeName: PipeName,
    private artifactFactory: ArtifactFactory,
    private scope: ScopeMain,
    private configStore: ConfigStoreMain
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
      options.skipTests,
      options.skipTasks
    );
    tasksQueue.validate();
    this.logger.info(`going to run tasks in the following order:\n${tasksQueue.toString()}`);
    this.logger.console('\n'); // this is to make is clear separation between the various pipelines (build/snap/tag)
    const title = `Running ${this.displayPipeName} pipeline using ${envs.length} environment(s), total ${tasksQueue.length} tasks`;
    const longProcessLogger = this.logger.createLongProcessLogger(title, undefined, 'title');
    const envsBuildContext: EnvsBuildContext = {};
    const capsulesBaseDir = this.getComponentsCapsulesBaseDir();

    const baseDir = options.capsulesBaseDir || capsulesBaseDir;
    const useHash = !baseDir;
    const isolateOptions = {
      baseDir,
      useHash,
      getExistingAsIs: true,
      seedersOnly: options.seedersOnly,
    };

    await pMapSeries(envsExecutionContext, async (executionContext) => {
      const componentIds = executionContext.components.map((component) => component.id);
      const { originalSeeders } = options;
      const originalSeedersOfThisEnv = componentIds.filter((compId) =>
        originalSeeders ? originalSeeders.find((seeder) => compId.isEqual(seeder)) : true
      );
      const capsuleNetwork = await this.isolator.isolateComponents(componentIds, isolateOptions);
      capsuleNetwork._originalSeeders = originalSeedersOfThisEnv;
      const msg = `building ${chalk.cyan(originalSeedersOfThisEnv.length.toString())} components of env ${chalk.cyan(executionContext.id)}`;
      const extraDetails = `original seeders of this env: ${originalSeedersOfThisEnv.length}, graph of this env: ${capsuleNetwork.seedersCapsules.length}, graph total (include other envs): ${capsuleNetwork.graphCapsules.length}`;
      this.logger.console(`${msg}. ${chalk.dim(extraDetails)}`);
      const buildContext = Object.assign(executionContext, {
        capsuleNetwork,
        previousTasksResults: [],
        pipeName: this.displayPipeName,
        dev: options.dev,
        laneId: this.scope.legacyScope.getCurrentLaneId(),
      });
      envsBuildContext[executionContext.id] = buildContext;
    });
    const envIdsWithoutVersion = envs.map((env) => env.id.split('@')[0]);
    const buildPipe = new BuildPipe(
      tasksQueue,
      envsBuildContext,
      this.logger,
      this.artifactFactory,
      options.previousTasksResults,
      {
        exitOnFirstFailedTask: options.exitOnFirstFailedTask,
        showEnvNameInOutput: envs.length > 1,
        showEnvVersionInOutput: envIdsWithoutVersion.length > uniq(envIdsWithoutVersion).length,
      }
    );
    const buildResults = await buildPipe.execute();
    longProcessLogger.end(buildResults.hasErrors() ? 'error' : 'success');

    return buildResults;
  }

  getComponentsCapsulesBaseDir(): string | undefined {
    return this.configStore.getConfig(CFG_CAPSULES_BUILD_COMPONENTS_BASE_DIR);
  }

  render() {
    const descriptor = this.getDescriptor();
    return descriptor;
  }

  transform(env: Env, envContext: EnvContext): BuilderTransformationMap | undefined {
    if (!env?.build) return undefined;
    return {
      getBuildPipe: () => {
        // TODO: refactor after defining for an env property
        const pipeline = env.build?.();
        if (!pipeline || !pipeline.compute) return [];
        return pipeline?.compute(envContext);
      },
      getTagPipe: () => {
        // TODO: refactor after defining for an env property
        const pipeline = env.tag?.();
        if (!pipeline || !pipeline.compute) return [];
        return pipeline?.compute(envContext);
      },
      getSnapPipe: () => {
        const pipeline = env.snap?.();
        if (!pipeline || !pipeline.compute) return [];
        return pipeline?.compute(envContext);
      },
    };
  }

  getDescriptor() {
    return 'run `bit build --list-tasks <component-id>` to see the tasks list for the pipelines: build, tag and snap';
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
