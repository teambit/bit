/** @flow */
import camelcase from 'camelcase';
import type { BitProps } from '../bit';

export default ({ name }: BitProps) => {
  return `
/**
 *
 */
module.exports = function ${camelcase(name)}() {
   
};`;
