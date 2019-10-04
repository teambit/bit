import * as stylable from './wix/stylable';

export type FileTypePlugin = {
  pluginType: string;
  getExtension: Function;
  getTemplate: Function;
  detective: Function;
};

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
const fileTypesPlugins: FileTypePlugin[] = [stylable];

export default fileTypesPlugins;
