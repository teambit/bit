const definetlyTypedRegex = /^(@([-\w]+)\/)?/;

// it seems definetly typed are using this:
// `const dtsName = packageName.replace("@", "").replace("/", "__")`

export function packageToDefinetlyTyped(pkgName: string) {
  return pkgName.replace(definetlyTypedRegex, '@types/$2__');
}
