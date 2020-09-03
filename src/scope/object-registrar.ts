import { Lane, ModelComponent, ScopeMeta, Source, Symlink, Version } from './models';

export default function types() {
  return [Source, ModelComponent, Version, ScopeMeta, Symlink, Lane];
}

function typesToObject(typesArr: Function[]) {
  return typesArr.reduce((map, objectType) => {
    map[objectType.name] = objectType;
    return map;
  }, {});
}

const typesObj = typesToObject(types());

export { typesObj, typesToObject };
