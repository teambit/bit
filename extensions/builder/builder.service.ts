import { EnvService, ExecutionContext } from '@teambit/environments';
import { Logger } from '@teambit/logger';
import { Workspace } from '@teambit/workspace';

import { BuildPipe } from './build-pipe';
import { TaskSlot } from './builder.main.runtime';
import { BuildResults, BuildTask } from './types';

export type BuildServiceResults = { id: string; buildResults: BuildResults[]; errors?: [] };

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
    private taskSlot: TaskSlot
  ) {}

  /**
   * runs a pipeline of tasks on all components in the execution context.
   */
  async run(context: ExecutionContext): Promise<BuildServiceResults> {
    const title = `running build for environment ${context.id}, total ${context.components.length} components`;
    const longProcessLogger = this.logger.createLongProcessLogger(title);
    this.logger.consoleTitle(title);
    // make build pipe accessible throughout the context.
    if (!context.env.getPipe) {
      throw new Error(`Builder service expects ${context.id} to implement getPipe()`);
    }
    const buildTasks: BuildTask[] = context.env.getPipe(context);
    // merge with extension registered tasks.
    const mergedTasks = buildTasks.concat(this.taskSlot.values());
    const buildPipe = BuildPipe.from(mergedTasks, this.logger);
    this.logger.info(`start running building pipe for "${context.id}". total ${buildPipe.tasks.length} tasks`);

    const componentIds = context.components.map((component) => component.id.toString());
    const buildContext = Object.assign(context, {
      capsuleGraph: await this.workspace.createNetwork(componentIds, { installPackages: false }),
    });

    const buildResults = await buildPipe.execute(buildContext);
    longProcessLogger.end();
    this.logger.consoleSuccess();
    return { id: context.id, buildResults };
  }
}
