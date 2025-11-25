import { MainRuntime } from '@teambit/cli';
import { ObjectsAspect } from './objects.aspect';

export class ObjectsMain {
  static slots = [];
  static dependencies = [];
  static runtime = MainRuntime;
  static async provider() {
    return new ObjectsMain();
  }
}

ObjectsAspect.addRuntime(ObjectsMain);

export default ObjectsMain;
