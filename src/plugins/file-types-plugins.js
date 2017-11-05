/** @flow */
import * as stylable from './wix/stylable';

export type FileTypePlugin = {
  pluginType: string,
  getExtension: Function,
  getTemplate: Function,
  detective: Function
};

const fileTypesPlugins: FileTypePlugin[] = [stylable];

export default fileTypesPlugins;
