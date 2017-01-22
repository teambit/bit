/** @flow */
import Command from '../../command';
import { pack } from '../../cli-utils';
import ComponentObjects from '../../../scope/component-objects';
import { fromBase64 } from '../../../utils';
import { put } from '../../../api/scope';

export default class Put extends Command {
  name = '_put <path> <objects>';
  private = true;
  description = 'upload a bit to a scope';
  alias = '';
  opts = [];
  
  action([path, objects, ]: [string, string, string, ]): Promise<any> {
    return put({
      componentObjects: fromBase64(objects),
      path: fromBase64(path)
    });
  }

  report(componentObjects: ComponentObjects): string {
    return pack(componentObjects.toString());
  }
}
