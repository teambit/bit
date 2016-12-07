/** @flow */
import camelcase from 'camelcase';
import type { BitProps } from '../bit';

const createImpl = ({ name }: BitProps): string => {
  return `
/**
 @TODO - write a spec template
 */
module.exports = function ${camelcase(name)}Spec() {
   
};`;
};

export default createImpl;
