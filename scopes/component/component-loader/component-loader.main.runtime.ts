import { MainRuntime } from '@teambit/cli';
import { ComponentLoaderAspect } from './component-loader.aspect';

export class ComponentLoaderMain {
  // your aspect API goes here.
  getSomething() {}

  static slots = [];
  // define your aspect dependencies here.
  // in case you need to use another aspect API.
  static dependencies = [];

  static runtime = MainRuntime;

  static async provider() {
    return new ComponentLoaderMain();
  }
}

ComponentLoaderAspect.addRuntime(ComponentLoaderMain);

export default ComponentLoaderMain;
