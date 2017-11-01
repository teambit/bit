/** @flow */
import fileTypesPlugins from '../../plugins/file-types-plugins';

export default function getExt(filename: string): string {
  const foundPlugin = fileTypesPlugins.find(plugin => filename.endsWith(`.${plugin.getExtension()}`));
  if (foundPlugin) return foundPlugin.getExtension();
  return filename.substring(filename.lastIndexOf('.') + 1, filename.length); // +1 to remove the '.'
}
