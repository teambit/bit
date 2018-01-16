/** @flow */
import { Source, Component, Version, ScopeMeta, Symlink } from './models';

export default function types() {
  return [Source, Component, Version, ScopeMeta, Symlink];
}

function typesToObject(typesArr: Function[]) {
  return typesArr.reduce((map, objectType) => {
    map[objectType.name] = objectType;
    return map;
  }, {});
}

const typesObj = typesToObject(types());

export { typesObj, typesToObject };
