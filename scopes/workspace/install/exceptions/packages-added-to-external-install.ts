import { BitError } from '@teambit/bit-error';
import type { ExternalInstaller } from '../install.main.runtime';

export class PackagesAddedToExternalInstall extends BitError {
  constructor(packages: string[], installer: ExternalInstaller) {
    const pronoun = packages.length > 1 ? 'them' : 'it';
    const howToAdd = installer.howToAddPackages?.(packages) || `add ${pronoun} with ${installer.name}`;
    super(`unable to add ${packages.join(', ')}: ${installer.name} installs this workspace. ${howToAdd}`);
  }
}
