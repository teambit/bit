import chalk from 'chalk';
import AbstractError from '../../../error/abstract-error';

export class FailedLoadForTag extends AbstractError {
  componentsWithRelativePaths: string[];
  componentsWithFilesNotDir: string[];

  constructor(componentsWithRelativePaths: string[], componentsWithFilesNotDir: string[]) {
    super();
    this.componentsWithRelativePaths = componentsWithRelativePaths;
    this.componentsWithFilesNotDir = componentsWithFilesNotDir;
  }

  getErrorMessage(): string {
    return this.getRelativePathsErrorOutput() + this.getCompWithFilesErrorOutput();
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
}
