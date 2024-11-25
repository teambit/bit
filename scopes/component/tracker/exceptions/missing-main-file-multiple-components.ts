import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';
import { BASE_DOCS_DOMAIN } from '@teambit/legacy/dist/constants';

export default class MissingMainFileMultipleComponents extends BitError {
  componentIds: string[];

  constructor(componentIds: string[]) {
    super(
      `error: the components ${chalk.bold(
        componentIds.join(', ')
      )} does not contain a main file.\nplease either use --id to group all added files as one component or use our DSL to define the main file dynamically.\nsee troubleshooting at ${BASE_DOCS_DOMAIN} components/component-main-file`
    );
    this.componentIds = componentIds;
  }
}
