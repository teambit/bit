/** @flow */
import { Source, ModelComponent, Version, ScopeMeta, Symlink, ExtensionDataModel } from './models';

export default function types() {
  return [Source, ModelComponent, Version, ScopeMeta, Symlink, ExtensionDataModel];
}

function typesToObject(typesArr: Function[]) {
  return typesArr.reduce((map, objectType) => {
    map[objectType.name] = objectType;
    return map;
  }, {});
}

const typesObj = typesToObject(types());

export { typesObj, typesToObject };
