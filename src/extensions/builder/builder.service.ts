import { EnvService, ExecutionContext } from '../environments';
import { Workspace } from '../workspace';
import { BuildPipe } from './build-pipe';
import { LogPublisher } from '../logger';
import { BuildTask } from './types';
import loader from '../../cli/loader';

export class BuilderService implements EnvService {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace,
    private logger: LogPublisher
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
    const buildPipe = BuildPipe.from(buildTasks, this.logger);
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
