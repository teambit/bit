import chalk from 'chalk';

// @todo: should extends BitError
export default class InvalidName extends Error {
  componentName: string;

  constructor(componentName: string) {
    super(
      `error: "${chalk.bold(
        componentName
      )}" is invalid, component names can only contain alphanumeric, lowercase characters, and the following ["-", "_", "$", "!", "/"]`
    );
  }
}
