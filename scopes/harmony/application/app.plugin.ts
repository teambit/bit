import { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import { ApplicationSlot } from './application.main.runtime';

export class AppPlugin implements PluginDefinition {
  constructor(private appSlot: ApplicationSlot) {}

  // TODO - this matches NOTHING
  pattern = '*.bit-app.*';

  runtimes = [MainRuntime.name];

  register(object: any) {
    return this.appSlot.register([object]);
  }
}
