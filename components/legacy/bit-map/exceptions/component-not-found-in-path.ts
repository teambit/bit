import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export class ComponentNotFoundInPath extends BitError {
  path: string;
  code: number;

  constructor(path: string, cause?: Error) {
    super(`error: component in path "${chalk.bold(
      path
    )}" was not found, the following options are available depending on the situation:
1. if the component directory was deleted by mistake, you can restore it by running "bit checkout reset <component-id>".
2. if the component-dir was renamed, you can use "bit move <old-dir> <new-dir>" to move it to the new location.
3. if the component directory was deleted deliberately, you can remove the component from the workspace by running "bit remove <component-id>".`);
    this.code = 127;
    this.path = path;
    if (cause) this.cause = cause;
  }
}
