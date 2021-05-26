import { BitError } from '@teambit/bit-error';

export class ParentDirTracked extends BitError {
  constructor(parentDir: string, componentName: string, currentDir: string) {
    super(`unable to add "${currentDir}", an existing component "${componentName}" already has its parent-dir "${parentDir}" as the root-dir.
if you would like "${currentDir}" as a separate component, please extract it outside "${parentDir}"`);
  }
}
