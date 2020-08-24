import toArray from 'lodash.toarray';
import R from 'ramda';

import AbstractError from '../../../../error/abstract-error';

export default class DuplicateIds extends AbstractError {
  componentObject: Record<string, any>;
  constructor(componentObject: Record<string, any>) {
    super();
    const componentIds = {};
    Object.keys(componentObject).forEach((key) => {
      const fileArr = componentObject[key].map((c) => R.pluck('relativePath')(c.files));
      const flattendFiles = R.flatten(toArray(fileArr));
      componentIds[key] = flattendFiles;
    });
    this.componentObject = componentIds;
  }
}
