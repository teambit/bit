// @flow
import { loadScope } from '../../../scope';

export default function list(path: string, all: boolean): Promise<any> {
  return loadScope(path).then(scope => scope.listStage(all));
}
