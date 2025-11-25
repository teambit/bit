import type { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import type { ApplicationSlot } from './application.main.runtime';

export const BIT_APP_PATTERN = '*.bit-app.*';

export class AppPlugin implements PluginDefinition {
  constructor(private appSlot: ApplicationSlot) {}

  pattern = BIT_APP_PATTERN;

  runtimes = [MainRuntime.name];

  register(object: any) {
    return this.appSlot.register([object]);
  }
}
