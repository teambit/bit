import { loadScope } from '../../../scope';
import ConsumerComponent from '../../../consumer/component';

export default function list(path: string): Promise<any> {
  return loadScope(path)
  .then(scope => scope.listStage())
  .then((components: ConsumerComponent[]) => {
    return components.map((c) => {
      return c.toString();
    });
  });
}
