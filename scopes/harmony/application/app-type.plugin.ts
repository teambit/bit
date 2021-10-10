import { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import { ApplicationType } from './application-type';
import { ApplicationSlot } from './application.main.runtime';

export class AppTypePlugin implements PluginDefinition {
  constructor(
    readonly pattern: string,
    readonly appType: ApplicationType<unknown>,
    readonly appSlot: ApplicationSlot
  ) {}

  runtimes = [MainRuntime.name];

  register(object: any) {
    this.appSlot.register([this.appType.createApp(object)]);
  }
}
