// @flow
import { loadScope } from '../../../scope';
import ComponentObjects from '../../../scope/component-objects';

export type ComponentObjectsInput = {
  path: string,
  componentObjects: ComponentObjects
};

export default function put({ path, componentObjects }: ComponentObjectsInput): Promise<any> {
  return loadScope(path).then((scope) => {
    const allComponents = ComponentObjects.manyFromString(componentObjects);
    return scope.exportManyBareScope(allComponents);
  });
}
