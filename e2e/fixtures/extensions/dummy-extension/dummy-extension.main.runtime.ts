import { MainRuntime } from '@teambit/cli';
import { DummyExtensionAspect } from './dummy-extension.aspect';

export class DummyExtensionMain {
  static runtime = MainRuntime;
  static dependencies = [];

  static async provider() {
    console.log('dummy extension runs');
  }
}
export default DummyExtensionMain;
DummyExtensionAspect.addRuntime(DummyExtensionMain);
