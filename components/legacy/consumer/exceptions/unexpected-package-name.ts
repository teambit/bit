import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export class UnexpectedPackageName extends BitError {
  constructor(pkgName: string) {
    super(
      `error: component-id can't start with "@", the entered id ${chalk.bold(
        pkgName
      )} might be a package name, please enter the component-id instead`
    );
  }
}
