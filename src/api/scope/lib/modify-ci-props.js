/** @flow */
import { loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';
import ConsumerComponent from '../../../consumer/component';

export default function modifyCIProps(path: string, id: string, ciProps: Object): Promise<any> {
  return loadScope(path)
  .then((scope) => {
    const bitId = BitId.parse(id);
    return scope.loadComponent(bitId)
    .then((c: ConsumerComponent) =>
      scope.sources.modifyCIProps({ source: c, ciProps }));
  });
}
