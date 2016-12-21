/** @flow */
import camelcase from 'camelcase';
import type { BitProps } from '../bit';

const createSpec = ({ name }: BitProps): string => {
  return `const ${camelcase(name)} = require('./impl.js');

describe('${camelcase(name)}', () => {
    it('', () => {
        
    });
});`;
};

export default createSpec;
