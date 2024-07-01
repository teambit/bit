import toArray from 'lodash.toarray';
import R from 'ramda';

import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';

export default class DuplicateIds extends BitError {
  componentObject: Record<string, any>;
  constructor(componentObject: Record<string, any>) {
    const componentIds = {};
    Object.keys(componentObject).forEach((key) => {
      const fileArr = componentObject[key].map((c) => R.pluck('relativePath')(c.files));
      const flattendFiles = R.flatten(toArray(fileArr));
      componentIds[key] = flattendFiles;
    });
    super(
      Object.keys(componentIds)
        .map((key) => {
          return `unable to add ${Object.keys(componentIds[key]).length} components with the same ID: ${chalk.bold(
            key
          )} : ${componentIds[key]}\n`;
        })
        .join(' ')
    );
    this.componentObject = componentIds;
  }
}
