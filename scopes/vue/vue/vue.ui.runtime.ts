import { UIRuntime } from '@teambit/ui';
import { APIReferenceAspect } from '@teambit/api-reference';
import { VueAspect } from './vue.aspect';
import { VueSchema } from './vue.schema';
import { vueRenderer } from './vue.renderer';

export class VueMain {
  static slots = [];
  // define your aspect dependencies here.
  // in case you need to use another aspect API.
  static dependencies = [APIReferenceAspect];

  static runtime = UIRuntime;

  static async provider([apiUI]) {
    apiUI.registerSchemaClasses(() => [VueSchema]);
    apiUI.registerAPINodeRenderer([vueRenderer]);
    return new VueMain();
  }
}

VueAspect.addRuntime(VueMain);

export default VueMain;
