/** @flow */
import camelcase from 'camelcase';

export default ({ name }: { name: string }): string => {
  return `const expect = require('chai').expect;
const ${camelcase(name)} = require('./impl.js');

describe('${camelcase(name)}', () => {
  it('', () => {

  });
});`;
};
