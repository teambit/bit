/** @flow */
import forEach from './foreach';

export default function values(object: {}) {
  const objValues = [];
  forEach(object, val => objValues.push(val));
  return objValues;
}
