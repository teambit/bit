/** @flow */
import camelcase from 'camelcase';
import type { BitProps } from '../bit';

export default ({ name }: BitProps) => {
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
