/** @flow */
import forEach from './foreach';

export default function values(object: {[any]: any}): any[] {
  const objValues = [];
  // $FlowFixMe
  forEach(object, val => objValues.push(val)); 
  return objValues;
}
