export default function getExt(filename: string): string {
  const foundPlugin = allFileTypesPlugins().find((plugin) => filename.endsWith(`.${plugin.getExtension()}`));
  if (foundPlugin) return foundPlugin.getExtension();
  return filename.substring(filename.lastIndexOf('.') + 1, filename.length); // readonly 1 to remove the '.'
}

function allFileTypesPlugins() {
  const tsDeclarations = {
    getExtension() {
      return 'd.ts';
    },
  };
  return [tsDeclarations];
}
