import {
  Lane,
  ModelComponent,
  ScopeMeta,
  Source,
  Symlink,
  Version,
  ExportMetadata,
  VersionHistory,
  LaneHistory,
} from '@teambit/objects';

export default function types() {
  return [Source, ModelComponent, Version, ScopeMeta, Symlink, Lane, ExportMetadata, VersionHistory, LaneHistory];
}

// it's possible to define the return type as `{ [typeName: string]: Types[0] }`. not sure if it makes sense
export function typesToObject(typesArr: Function[]) {
  return typesArr.reduce((map, objectType) => {
    map[objectType.name] = objectType;
    return map;
  }, {});
}

export const typesObj = typesToObject(types());

export type Types = ReturnType<typeof types>;
