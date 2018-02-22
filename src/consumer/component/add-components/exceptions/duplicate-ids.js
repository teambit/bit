/** @flow */
import R from 'ramda';
import toArray from 'lodash.toarray';

export default class DuplicateIds extends Error {
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
}
