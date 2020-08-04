import { EnvService, ExecutionContext } from '../environments';
import { Workspace } from '../workspace';
import { BuildPipe } from './build-pipe';
import { Logger } from '../logger';
import { BuildTask } from './types';
import { TaskSlot } from './builder.extension';

export class BuilderService implements EnvService {
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
  async run(context: ExecutionContext) {
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

    const buildContext = Object.assign(context, {
      capsuleGraph: await this.workspace.createNetwork(context.components.map((component) => component.id.toString())),
    });

    const components = await buildPipe.execute(buildContext);
    longProcessLogger.end();
    this.logger.consoleSuccess();
    return { id: context.id, components };
  }
}
