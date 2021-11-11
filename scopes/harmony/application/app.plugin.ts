import { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import { Application } from '.';
import { ApplicationSlot } from './application.main.runtime';

export class AppPlugin implements PluginDefinition<Application> {
  constructor(private appSlot: ApplicationSlot) {}

  pattern = '*.app.*';

  runtimes = [MainRuntime.name];

  register(object: Application) {
    return this.appSlot.register([object]);
  }
}
