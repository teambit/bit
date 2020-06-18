import { EnvService, ExecutionContext } from '../environments';
import { IsolatorExtension } from '../isolator';
import { Workspace } from '../workspace';
import { BuildPipe } from './build-pipe';

export class BuilderService implements EnvService {
  constructor(
    /**
     * isolator extension.
     */
    private isolator: IsolatorExtension,

    /**
     * workspace extension.
     */
    private workspace: Workspace
  ) {}

  /**
   * runs a pipeline of tasks on all components in the execution context.
   */
  async run(context: ExecutionContext) {
    // make build pipe accessible throughout the context.
    const buildPipe: BuildPipe = context.env.getPipe(context);
    if (!buildPipe) {
      throw new Error(`Builder service expects ${context.id} to implement getPipe()`);
    }

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
