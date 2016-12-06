/** @flow */
import camelcase from 'camelcase';
import type { BitProps } from '../bit';

const createImpl = ({ name }: BitProps): string => {
  return `
/**
 * @param {type} name
 * @returns
 * @sig 
 * @example
 * // example description
 * example.do(); //outputs nothing
 */
module.exports = function ${camelcase(name)}() {
   
};`;
};

export default createImpl;
