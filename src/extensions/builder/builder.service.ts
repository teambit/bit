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
    // make release pipe accessible throughout the context.
    const releasePipe: BuildPipe = context.env.getPipe(context);
    if (!releasePipe) {
      throw new Error(`releaser service expects ${context.id} to implement getPipe()`);
    }

    const releaseContext = Object.assign(context, {
      capsuleGraph: await this.isolator.createNetworkFromConsumer(
        context.components.map(component => component.id.toString()),
        this.workspace.consumer
      )
    });

    const results = await releasePipe.execute(releaseContext);

    return { id: context.id, results };
  }
}
