const scopedRegistryRegex = /^(@([-\w]+)\/)/;
const scopedRegistryReplace = '$2__';

// it seems definetly typed are using this:
// `const dtsName = packageName.replace("@", "").replace("/", "__")`

export function packageToDefinetlyTyped(pkgName: string) {
  const escaped = pkgName.replace(scopedRegistryRegex, scopedRegistryReplace);
  return `@types/${escaped}`;
}
