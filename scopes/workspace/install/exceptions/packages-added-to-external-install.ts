import { BitError } from '@teambit/bit-error';

export class PackagesAddedToExternalInstall extends BitError {
  constructor(packages: string[], installerName: string) {
    super(
      `unable to add ${packages.join(', ')}: ${installerName} installs this workspace from the package.json of each package. add the dependency to the package.json of the package that uses it, then run "bit install"`
    );
  }
}
