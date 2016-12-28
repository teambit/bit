/** @flow */
import camelcase from 'camelcase';
import type { BitProps } from '../bit';

export default ({ name }: BitProps): string => {
  return `
/**
 * {description}
 * @param {type} name
 * @returns
 * 
 */
module.exports = function ${camelcase(name)}() {
   
};`;
};
