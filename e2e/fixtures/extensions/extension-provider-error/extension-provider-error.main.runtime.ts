import { MainRuntime } from '@teambit/cli';
import { ExtensionProviderErrorAspect } from './extension-provider-error.aspect';

export class ExtensionProviderErrorMain {
  static runtime = MainRuntime;
  static dependencies = [];

  static async provider() {
    throw new Error('error in provider');
  }
}
export default ExtensionProviderErrorMain;
ExtensionProviderErrorAspect.addRuntime(ExtensionProviderErrorMain);
