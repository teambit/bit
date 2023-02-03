import { BabelAspect } from './babel.aspect';
import { CLIRuntime } from '../react/react.aspect';

export class BabelCLI {
  compile() {
    console.log('compiled!');
  }

  static runtime = CLIRuntime;

  static async provider() {
    return new BabelCLI();
  }
}

BabelAspect.addRuntime(BabelCLI);
