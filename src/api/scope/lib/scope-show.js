import { loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';
import ConsumerComponent from '../../../consumer/component';

export default function list(path: string, id: string): Promise<any> {
  return loadScope(path)
  .then((scope) => {
    const bitId = BitId.parse(id);
    return scope.loadComponent(bitId)
    .then((c: ConsumerComponent) => c.toString());
  });
}
