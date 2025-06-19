import { MainRuntime } from '@teambit/cli';
import { SchemaAspect } from '@teambit/schema';
import { VueAspect } from './vue.aspect';
import { VueSchema } from './vue.schema';

export class VueMain {
  static slots = [];
  // define your aspect dependencies here.
  // in case you need to use another aspect API.
  static dependencies = [SchemaAspect];

  static runtime = MainRuntime;

  static async provider([schemaMain]) {
    if (schemaMain) schemaMain.registerSchemaClasses(() => [VueSchema]);
    return new VueMain();
  }
}

VueAspect.addRuntime(VueMain);

export default VueMain;
