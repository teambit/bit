import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';
import { BASE_DOCS_DOMAIN } from '@teambit/legacy.constants';

export default class MissingMainFile extends BitError {
  componentId: string;
  mainFile: string;
  files: string[];

  constructor(componentId: string, mainFile: string, files: string[]) {
    super(
      `error: the component ${chalk.bold(
        componentId
      )} does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at ${BASE_DOCS_DOMAIN}components/component-main-file`
    );
    this.componentId = componentId;
    this.mainFile = mainFile;
    this.files = files;
  }
}
