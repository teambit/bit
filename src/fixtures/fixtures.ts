export const isType = "module.exports = function isType() { return 'got is-type'; };";
export const isTypeV2 = "module.exports = function isType() { return 'got is-type v2'; };";
export const isTypeV3 = "module.exports = function isType() { return 'got is-type v3'; };";
export const comp3V2 = "module.exports = () => 'comp3 v2';";
export const isTypeSpec = (testShouldPass) => `const expect = require('chai').expect;
const isType = require('./is-type.js');

describe('isType', () => {
  it('should display "got is-type"', () => {
    expect(isType())${testShouldPass ? '' : '.not'}.to.equal('got is-type');
  });
});`;
export const isTypeES6 = "export default function isType() { return 'got is-type'; };";
export const isTypeLeftPad = `
const leftPad = require('left-pad');
module.exports = function isType() { return leftPad('got is-type', 15, 0); };
`;
export const isTypeTS = "export default function isType() { return 'got is-type'; };";
export const isString =
  "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
export const isStringV2 =
  "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string v2'; };";
export const isStringV3 =
  "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string v3'; };";
export const isStringSpec = (testShouldPass) => `const expect = require('chai').expect;
const isString = require('./is-string.js');

describe('isString', () => {
  it('should display "got is-type and got is-string"', () => {
    expect(isString())${testShouldPass ? '' : '.not'}.to.equal('got is-type and got is-string');
  });
});`;
export const isStringES6 =
  "import isType from './is-type.js'; export default function isString() { return isType() +  ' and got is-string'; };";
export const isStringTS =
  "import isType from './is-type'; export default function isString() { return isType() +  ' and got is-string'; };";
export const isStringModulePath = (remoteScope) =>
  `const isType = require('@bit/${remoteScope}.utils.is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };`;
export const isStringModulePathNoScope =
  "const isType = require('@bit/utils.is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
export const barFooFixture =
  "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
export const barFooFixtureV2 =
  "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo v2'; };";
export const barFooES6 =
  "import isString from '../utils/is-string.js'; export default function foo() { return isString() + ' and got foo'; };";
export const barFooTS =
  "import isString from '../utils/is-string'; export default function foo() { return isString() + ' and got foo'; };";
export const barFooSpecES6 = (testShouldPass) => `const expect = require('chai').expect;
const foo = require('./foo.js');

describe('foo', () => {
  it('should display "got is-type and got is-string and got foo"', () => {
    expect(foo.default())${testShouldPass ? '' : '.not'}.to.equal('got is-type and got is-string and got foo');
  });
});`;
export const barFooModulePath = (remoteScope) =>
  `const isString = require('@bit/${remoteScope}.utils.is-string'); module.exports = function foo() { return isString() + ' and got foo'; };`;
export const barFooModulePathNoScope =
  "const isString = require('@bit/utils.is-string'); module.exports = function foo() { return isString() + ' and got foo'; };";
export const appPrintIsType = "const isType = require('./components/utils/is-type'); console.log(isType());";
export const appPrintIsTypeCapsule = "const isType = require('.'); console.log(isType());";
export const appPrintIsString = "const isString = require('./components/utils/is-string'); console.log(isString());";
export const appPrintIsStringCapsule = "const isString = require('.'); console.log(isString());";
export const appPrintBarFoo = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
export const appPrintBarFooModulePath = (remoteScope) =>
  `const barFoo = require('@bit/${remoteScope}.bar.foo'); console.log(barFoo());`;
export const appPrintComp1 = (remoteScope) => `const comp1 = require('@${(remoteScope)}/comp1');\nconsole.log(comp1())`
export const appPrintBarFooCapsule = "const barFoo = require('.'); console.log(barFoo());";
export const appPrintBarFooES6 = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
export const appPrintBarFooAuthor = "const barFoo = require('./bar/foo'); console.log(barFoo());";
export const objectRestSpread = `const g = 5;
const x = {a: "a", b: "b"}
const y = {c: "c"}
const z = {...x, ...y}`;
export const objectRestSpreadWithChange = `const g = 5;
const x = {a: "a", b: "c"}
const y = {c: "c"}
const z = {...x, ...y}`;
export const passTest = `const expect = require('chai').expect
describe('group of passed tests', () => {
  it('passed test case', () => {
    expect(true).to.be.true;
  });
});`;
export const failTest = `const expect = require('chai').expect
describe('group of failed tests', () => {
  it('failed test case', () => {
    expect(true).to.be.false;
  });
});`;
export const exceptionTest = `const expect = require('chai').expect
describe('group of failed tests', () => {
  throw new Error('exception during test file');
  it('failed test case', () => {
    expect(true).to.be.false;
  });
});`;
export const fooFixture = "module.exports = function foo() { return 'got foo'; }";
export const fooFixtureV2 = "module.exports = function foo() { return 'got foo v2'; }";
export const fooFixtureV3 = "module.exports = function foo() { return 'got foo v3'; }";
