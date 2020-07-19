import { DEFAULT_COMPONENTS_DIR_PATH, DEFAULT_DEPENDENCIES_DIR_PATH } from '../../constants';
import GeneralError from '../../error/general-error';
import logger from '../../logger/logger';

export default class BitStructure {
  _componentsDefaultDirectoryUnProcessed: string;
  _componentsDefaultDirectory?: string;
  dependenciesDirectory: string;
  constructor(componentsDefaultDirectory: string | undefined, dependenciesDirectory: string | undefined) {
    this._componentsDefaultDirectoryUnProcessed = componentsDefaultDirectory || DEFAULT_COMPONENTS_DIR_PATH;
    this.dependenciesDirectory = dependenciesDirectory || DEFAULT_DEPENDENCIES_DIR_PATH;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get dependenciesDirStructure(): string {
    return this.dependenciesDirectory;
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get componentsDefaultDirectory(): string {
    if (!this._componentsDefaultDirectory) {
      const dirStructure = this._componentsDefaultDirectoryUnProcessed;
      const dirStructureParsed = [];
      dirStructure.split('/').forEach((dir) => {
        if (dir.startsWith('{') && dir.endsWith('}')) {
          // this is a dynamic parameter
          const dirStripped = dir.replace(/[{}]/g, '');
          const componentPart = this._getComponentStructurePart(dirStructure, dirStripped);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          if (componentPart) dirStructureParsed.push(`{${componentPart}}`);
        } else {
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          dirStructureParsed.push(dir);
        }
      });
      this._componentsDefaultDirectory = dirStructureParsed.join('/');
    }
    return this._componentsDefaultDirectory;
  }

  _getComponentStructurePart(componentStructure: string, componentPart: string): string {
    switch (componentPart) {
      case 'name':
      case 'scope':
      case 'version':
        return componentPart;
      case 'namespace':
        logger.warn(
          'your bit.json has an obsolete "namespace" set in componentsDefaultDirectory property, it has been ignored'
        );
        return ''; // this the dynamic namespace feature, the namespace doesn't exist, it's part of the name
      default:
        throw new GeneralError(
          `the "${componentPart}" part of the component structure "${componentStructure}" is invalid, it must be one of the following: "name", "scope" or "version" `
        );
    }
  }
}
