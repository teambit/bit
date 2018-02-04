export const isType = "module.exports = function isType() { return 'got is-type'; };";
export const isTypeES6 = "export default function isType() { return 'got is-type'; };";
export const isString =
  "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
export const isStringES6 =
  "import isType from './is-type.js'; export default function isString() { return isType() +  ' and got is-string'; };";
export const barFooFixture =
  "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
export const barFooFixtureV2 =
  "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo v2'; };";
export const barFooES6 =
  "import isString from '../utils/is-string.js'; export default function foo() { return isString() + ' and got foo'; };";
export const barFooSpecES6 = testShouldPass => `const expect = require('chai').expect;
const foo = require('./foo.js');

describe('foo', () => {
  it('should display "got is-type and got is-string and got foo"', () => {
    expect(foo())${testShouldPass ? '' : '.not'}.to.equal('got is-type and got is-string and got foo');
  });
});`;
export const appPrintBarFoo = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
