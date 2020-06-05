import { EnvService, ExecutionContext } from '../environments';
import { Isolator } from '../isolator';
import { Workspace } from '../workspace';

export class ReleasesService implements EnvService {
  constructor(
    /**
     * isolator extension.
     */
    private isolator: Isolator,

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
    const releasePipe = context.env.getPipe(context);
    if (!releasePipe) {
      throw new Error('releaser.runRelease expects concreteReleaser to implement onRelease()');
    }

    const releaseContext = Object.assign(context, {
      capsuleGraph: await this.isolator.createNetworkFromConsumer(
        context.components.map(component => component.id.toString()),
        this.workspace.consumer
      )
    });

    const resultsP = releasePipe.execute(releaseContext);

    return { id: context.id, results: await Promise.all(resultsP) };
  }
}
