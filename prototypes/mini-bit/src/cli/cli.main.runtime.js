import { CLIAspect } from './cli.aspect.js';
import { CLIMain } from './cli-main.js';

export class CLIMainRuntime {
  static id = CLIAspect.id;
  static dependencies = [];
  static slots = [];
  static async provider(_deps, _config, _slots, harmony) {
    return new CLIMain(harmony);
  }
}
