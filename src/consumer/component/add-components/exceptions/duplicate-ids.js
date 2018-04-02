/** @flow */
import R from 'ramda';
import toArray from 'lodash.toarray';
import AbstractError from '../../../../error/abstract-error';

export default class DuplicateIds extends AbstractError {
  componentObject: Object;
  constructor(componentObject: Object) {
    super();
    const componentIds = {};
    Object.keys(componentObject).forEach((key) => {
      const fileArr = componentObject[key].map(c => R.pluck('relativePath')(c.files));
      const flattendFiles = R.flatten(toArray(fileArr));
      componentIds[key] = flattendFiles;
    });
    this.componentObject = componentIds;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.componentObject = this.toHash(JSON.stringify(clone.componentObject));
    return clone;
  }
}
