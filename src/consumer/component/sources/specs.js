/** @flow */
import Source from './source';
import BitId from '../../../bit-id';
import createTemplate from '../templates/specs.default-template';
import { Scope } from '../../../scope';

export default class Specs extends Source {
  static create(name: string, testerId: BitId, scope: Scope): Specs {
    function getTemplate() {
      try {
        const testerModule = scope.loadEnvironment(testerId);
        return testerModule.getTemplate(name);
      } catch (e) {
        return createTemplate({ name });
      }
    }

    return new Specs(getTemplate());
  }
}
