import { EnvService, ExecutionContext } from '../environments';
import { IsolatorExtension } from '../isolator';
import { Workspace } from '../workspace';
import { BuildPipe } from './build-pipe';
import { LogPublisher } from '../types';
import { BuildTask } from './types';

export class BuilderService implements EnvService {
  constructor(
    /**
     * isolator extension.
     */
    private isolator: IsolatorExtension,

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
    // make build pipe accessible throughout the context.
    if (!context.env.getPipe) {
      throw new Error(`Builder service expects ${context.id} to implement getPipe()`);
    }
    const buildTasks: BuildTask[] = context.env.getPipe(context);
    const buildPipe = BuildPipe.from(buildTasks, this.logger);
    this.logger.info(
      context.id,
      `start running building pipe for "${context.id}". total ${buildPipe.tasks.length} tasks`
    );

    const buildContext = Object.assign(context, {
      capsuleGraph: await this.isolator.createNetworkFromConsumer(
        context.components.map(component => component.id.toString()),
        this.workspace.consumer
      )
    });

    const results = await buildPipe.execute(buildContext);

    return { id: context.id, results };
  }
}
