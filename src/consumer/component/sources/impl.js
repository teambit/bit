/** @flow */
import Source from './source';
import createTemplate from '../templates/impl.default-template';
import BitId from '../../../bit-id';
import { Scope } from '../../../scope';

export default class Impl extends Source {
  static create(name: string, compilerId: BitId, scope: Scope): Impl {
    function getTemplate() {
      try {
        if (!compilerId) return createTemplate({ name });
        // TODO: This need to be fixed.. it won't work any more
        // $FlowFixMe
        const testerModule = scope.loadEnvironment(compilerId);
        return testerModule.getTemplate(name);
      } catch (e) {
        return createTemplate({ name });
      }
    }

    return new Impl(getTemplate());
  }
}
