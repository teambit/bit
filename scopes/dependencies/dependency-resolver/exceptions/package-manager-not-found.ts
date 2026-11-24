import { BitError } from '@teambit/bit-error';

export class PackageManagerNotFound extends BitError {
  constructor(packageManagerName: string) {
    if (packageManagerName === 'teambit.dependencies/yarn') {
      super(
        `package manager: ${packageManagerName} is no longer supported. set "packageManager" in workspace.jsonc to "teambit.dependencies/pnpm" or remove it`
      );
      return;
    }
    super(`package manager: ${packageManagerName} was not found`);
  }
}
