import { Extension as HarmonyExtension, Harmony } from '@teambit/harmony';
import { Extension } from './extension';

@HarmonyExtension()
export class Core {
  constructor(private harmony: any) {}

  bootstrap(extension: Extension) {}

  static async provider([], harmony: Harmony) {
    return new Core(harmony);
  }
}
