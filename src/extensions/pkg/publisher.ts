import execa from 'execa';
import { IsolatorExtension } from '../isolator';
import { Scope } from '../../scope';
import { LogPublisher } from '../types';
import { BuildResults } from '../builder';
import { loadConsumer } from '../../consumer';

export type PublisherOptions = {
  dryRun: boolean;
};

export class Publisher {
  constructor(private isolator: IsolatorExtension, private logger: LogPublisher, private scope: Scope) {}

  async publish(componentIds: string[], options: PublisherOptions): Promise<BuildResults> {
    const packageManager = 'npm';
    // @todo hack alert!
    // currently, when loading a component from the model, it doesn't load the extension
    // as such, the package json value such as the main-file is not loaded from the env.
    // change it back to `createNetworkFromScope` once Gilad fixes it.
    const consumer = await loadConsumer();
    // const network = await this.isolator.createNetworkFromScope(componentIds, this.scope);
    const network = await this.isolator.createNetworkFromConsumer(componentIds, consumer);
    const resultsP = network.seedersCapsules.map(async capsule => {
      const publishParams = ['publish'];
      if (options.dryRun) publishParams.push('--dry-run');
      const publishParamsStr = publishParams.join(' ');
      const cwd = capsule.path;
      const componentIdStr = capsule.id.toString();
      const errors: string[] = [];
      let data;
      try {
        // @todo: once capsule.exec works properly, replace this
        const { stdout, stderr } = await execa(packageManager, publishParams, { cwd });
        this.logger.debug(componentIdStr, `successfully ran ${packageManager} ${publishParamsStr} at ${cwd}`);
        this.logger.debug(componentIdStr, `stdout: ${stdout}`);
        this.logger.debug(componentIdStr, `stderr: ${stderr}`);
        data = stdout;
      } catch (err) {
        const errorMsg = `failed running ${packageManager} ${publishParamsStr} at ${cwd}`;
        this.logger.error(errorMsg);
        this.logger.error(err.stderr);
        errors.push(`${errorMsg}\n${err.stderr}`);
      }
      return { id: capsule.component.id, data, errors };
    });
    const components = await Promise.all(resultsP);
    return {
      components,
      artifacts: []
    };
  }
}
