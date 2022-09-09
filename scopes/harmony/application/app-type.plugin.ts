import { PluginDefinition } from '@teambit/aspect-loader';
import { BitError } from '@teambit/bit-error';
import { MainRuntime } from '@teambit/cli';
import { Application } from './application';
import { ApplicationType } from './application-type';
import { ApplicationSlot } from './application.main.runtime';

export class AppTypePlugin implements PluginDefinition {
  constructor(readonly pattern: string, private appType: ApplicationType<unknown>, private appSlot: ApplicationSlot) {}

  runtimes = [MainRuntime.name];

  async register(object: any) {
    const app = await this.appType.createApp(object);
    this.validateApp(app);
    this.appSlot.register([app]);
  }

  private validateApp(app: Application) {
    if (app.name.includes(' ')) {
      throw new BitError(`app name "${app.name}" is invalid. spaces are not permitted`);
    }
  }
}
