import { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';
import { ApplicationType } from './application-type';
import { ApplicationSlot } from './application.main.runtime';

export class AppTypePlugin implements PluginDefinition<any> {
  constructor(readonly pattern: string, private appType: ApplicationType<unknown>, private appSlot: ApplicationSlot) {}

  runtimes = [MainRuntime.name];

  register(object: any) {
    this.appSlot.register([this.appType.createApp(object)]);
  }
}
