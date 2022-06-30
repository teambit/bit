import { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import { ApplicationType } from './application-type';
import { ApplicationSlot } from './application.main.runtime';

export class AppTypePlugin implements PluginDefinition {
  constructor(readonly pattern: string, private appType: ApplicationType<unknown>, private appSlot: ApplicationSlot) {}

  runtimes = [MainRuntime.name];

  async register(object: any) {
    const app = await this.appType.createApp(object);
    this.appSlot.register([app]);
  }
}
