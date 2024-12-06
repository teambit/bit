import { BitError } from '@teambit/bit-error';
import { DEFAULT_COMPONENTS_DIR_PATH } from '@teambit/legacy/dist/constants';

export default class BitStructure {
  private _componentsDefaultDirectory: string;
  private isComponentsDefaultDirectoryValidated = false;
  constructor(componentsDefaultDirectory: string | undefined) {
    this._componentsDefaultDirectory = componentsDefaultDirectory || DEFAULT_COMPONENTS_DIR_PATH;
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
