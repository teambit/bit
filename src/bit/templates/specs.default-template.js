/** @flow */
import camelcase from 'camelcase';
import type { BitProps } from '../bit';

export default ({ name }: BitProps): string => {
  return `const expect = require('chai').expect;
const ${camelcase(name)} = require('./impl.js');

describe('${camelcase(name)}', () => {
  it('', () => {
      
  });
});`;
};
