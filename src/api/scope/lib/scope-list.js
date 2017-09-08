import { loadScope } from '../../../scope';

export default function list(path: string): Promise<any> {
  return loadScope(path).then(scope => scope.listStage());
}
