import { BitError } from '@teambit/bit-error';
import { DEFAULT_COMPONENTS_DIR_PATH, DEFAULT_DEPENDENCIES_DIR_PATH } from '../../constants';

export default class BitStructure {
  private _componentsDefaultDirectory: string;
  private isComponentsDefaultDirectoryValidated = false;
  dependenciesDirectory: string;
  constructor(componentsDefaultDirectory: string | undefined, dependenciesDirectory: string | undefined) {
    this._componentsDefaultDirectory = componentsDefaultDirectory || DEFAULT_COMPONENTS_DIR_PATH;
    this.dependenciesDirectory = dependenciesDirectory || DEFAULT_DEPENDENCIES_DIR_PATH;
  }

  get dependenciesDirStructure(): string {
    return this.dependenciesDirectory;
  }

  get componentsDefaultDirectory(): string {
    if (!this.isComponentsDefaultDirectoryValidated) {
      const allowedPlaceholders = ['name', 'scope', 'scopeId', 'owner'];
      this._componentsDefaultDirectory.split('/').forEach((dir) => {
        if (dir.startsWith('{') && dir.endsWith('}')) {
          // this is a dynamic parameter
          const dirStripped = dir.replace(/[{}]/g, '');
          if (!allowedPlaceholders.includes(dirStripped)) {
            throw new BitError(
              `the "${dirStripped}" part of the component structure "${
                this._componentsDefaultDirectory
              }" is invalid, it must be one of the following: ${allowedPlaceholders.join(', ')}`
            );
          }
        }
      });
      this.isComponentsDefaultDirectoryValidated = true;
    }
    return this._componentsDefaultDirectory;
  }
}
