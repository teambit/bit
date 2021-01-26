import { BitError } from '@teambit/bit-error';

export class ExportMissingVersions extends BitError {
  constructor(componentId: string, versions: string[]) {
    super(`component "${componentId}" was exported without the following version(s): ${versions.join(', ')}.
consider adding "--all-versions" flag to the export command`);
  }
}
