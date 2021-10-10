import { PluginDefinition } from '@teambit/aspect-loader';
import { MainRuntime } from '@teambit/cli';

export class AppPlugin implements PluginDefinition {
  pattern = '*.app.*';

  runtimes = [MainRuntime.name];

  register(object: any) {
    console.log(object);
  }
}
