import { Lane, ModelComponent, ScopeMeta, Source, Symlink, Version } from './models';

export default function types() {
  return [Source, ModelComponent, Version, ScopeMeta, Symlink, Lane];
}

export function typesToObject(typesArr: Function[]) {
  return typesArr.reduce((map, objectType) => {
    map[objectType.name] = objectType;
    return map;
  }, {});
}

export const typesObj = typesToObject(types());

export type Types = ReturnType<typeof types>;
