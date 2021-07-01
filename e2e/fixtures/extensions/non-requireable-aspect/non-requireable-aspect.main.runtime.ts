throw new Error('error by purpose');
import { MainRuntime } from '@teambit/cli';
import { NonRequireableAspect } from './non-requireable-aspect.aspect';

export class NonRequireableMain {
  static runtime = MainRuntime;
  static dependencies = [];

  static async provider() {
    console.log('dummy extension runs');
  }
}
export default NonRequireableMain;
NonRequireableAspect.addRuntime(NonRequireableMain);
