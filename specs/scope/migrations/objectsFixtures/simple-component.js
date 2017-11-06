import BitRawObject from '../../../../src/scope/objects/raw-object';
import BitObject from '../../../../src/scope/objects/object';
import types from '../../../../src/scope/object-registrar';

const resolvedTypes = types().reduce((map, objectType) => {
  map[objectType.name] = objectType;
  return map;
}, {});

export const symlinkObjectData = { scope: null, box: 'test-dep', name: 'b', realScope: 'scoop' };
export const componentObjectData = {
  box: 'test-dep',
  name: 'b',
  scope: 'scoop',
  versions: { 1: '4602837264040ec231f0aa94d647bf4197a53a10' },
  lang: 'javascript',
  deprecated: false,
  bindingPrefix: 'bit'
};
export const version1ObjectData = {
  files: [{ file: 'da39a3ee5e6b4b0d3255bfef95601890afd80709', relativePath: 'b.js', name: 'b.js', test: false }],
  mainFile: 'b.js',
  bindingPrefix: 'bit',
  log: { message: 'gilad', date: '1509369338717', username: 'Gilad Shoham', email: 'gilad@cocycles.com' },
  ci: {},
  docs: [],
  dependencies: [],
  flattenedDependencies: [],
  packageDependencies: {}
};

export const symlinkObject = new BitRawObject(
  null,
  'a1c1e2fd31b25954b82d65cb1c89566a180d964e',
  resolvedTypes,
  'Symlink',
  null,
  symlinkObjectData
);
export const componentObject = new BitRawObject(
  null,
  'badd6115289dfcf107ed37269d9e2df564761fa1',
  resolvedTypes,
  'Component',
  null,
  componentObjectData
);
export const version1Object = new BitRawObject(
  null,
  '4602837264040ec231f0aa94d647bf4197a53a10',
  resolvedTypes,
  'Version',
  null,
  version1ObjectData
);
