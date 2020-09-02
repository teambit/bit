import chalk from 'chalk';

import AbstractError from '../../../error/abstract-error';

export class FailedLoadForTag extends AbstractError {
  componentsWithRelativePaths: string[];
  componentsWithFilesNotDir: string[];
  componentsWithCustomModuleResolution: string[];

  constructor(
    componentsWithRelativePaths: string[],
    componentsWithFilesNotDir: string[],
    componentsWithCustomModuleResolution: string[]
  ) {
    super();
    this.componentsWithRelativePaths = componentsWithRelativePaths;
    this.componentsWithFilesNotDir = componentsWithFilesNotDir;
    this.componentsWithCustomModuleResolution = componentsWithCustomModuleResolution;
  }

  getErrorMessage(): string {
    return (
      this.getRelativePathsErrorOutput() +
      this.getCompWithFilesErrorOutput() +
      this.getCompWithCustomModulesErrorOutput()
    );
  }

  getRelativePathsErrorOutput(): string {
    if (!this.componentsWithRelativePaths.length) return '';
    const components = this.componentsWithRelativePaths.join(', ');
    const title = `the following component(s) use relative paths to require other components.
replace to module paths or use "bit link --rewire" to replace.`;
    return `${title}\n${chalk.bold(components)}\n`;
  }

  getCompWithFilesErrorOutput(): string {
    if (!this.componentsWithFilesNotDir.length) return '';
    const components = this.componentsWithFilesNotDir.join(', ');
    const title = `\nthe following component(s) don't have a dedicated directory, instead, the files are spread across multiple directories.
refactor these components by moving the component files into one directory or use "bit move <component-id> <directory> --component" to do it for you.`;
    return `${title}\n${chalk.bold(components)}`;
  }

  getCompWithCustomModulesErrorOutput(): string {
    if (!this.componentsWithCustomModuleResolution.length) return '';
    const components = this.componentsWithCustomModuleResolution.join(', ');
    const title = `\nthe following component(s) use resolve-modules (aka aliases) feature, which is not supported anymore.
refactor these components to use module paths instead`;
    return `${title}\n${chalk.bold(components)}`;
  }
}
