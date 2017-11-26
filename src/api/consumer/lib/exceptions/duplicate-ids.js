/** @flow */
import R from 'ramda';
import toArray from 'lodash.toarray';

export default class DuplicateIds extends Error {
  component: Object;
  constructor(component: Object) {
    super();
    const componentIds = {};
    Object.keys(component).forEach((key) => {
      const fileArr = component[key].map(c => R.pluck('relativePath')(c.files));
      const flattendFiles = R.flatten(toArray(fileArr));
      componentIds[key] = flattendFiles;
    });
    this.component = componentIds;
  }
}
