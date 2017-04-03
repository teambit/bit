import { loadScope } from '../../../scope';
import ComponentObjects from '../../../scope/component-objects';

export type ComponentObjectsInput = {
  path: string;
  componentObjects: ComponentObjects
}

export default function put({ path, componentObjects }: ComponentObjectsInput): Promise<any> {
  return loadScope(path).then((scope) => {
    return scope.export(ComponentObjects.fromObject(componentObjects));
  });
}
