// covers also init, create, commit commands and the js-doc parser

import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';

const helper = new Helper();
const fooImplPath = path.join(helper.localScopePath, 'inline_components', 'global', 'foo', 'impl.js');

function commitFoo(implementation) {
  helper.cleanEnv();
  helper.runCmd('bit init');
  helper.runCmd('bit create foo');
  fs.writeFileSync(fooImplPath, implementation);
  helper.runCmd('bit commit foo commit-msg');
}

describe('bit show command', function () {
  this.timeout(0);
  describe('with no docs', () => {
    before(() => {
      const fooComponentFixture = "module.exports = function foo() { return 'got foo'; };";
      commitFoo(fooComponentFixture);
    });
    it('should display "No documentation found" when there is no documentation', () => {
      const output = helper.runCmd('bit show @this/global/foo');
      expect(output.includes('No documentation found')).to.be.true;
    });
    it('should not show the "description" field', () => {
      const output = helper.runCmd('bit show @this/global/foo');
      expect(output.includes('Description')).to.be.false;
    });
  });
  describe('with docs', () => {
    before(() => {
      const fooComponentFixture = `/**
 * Adds two numbers.
 * @name add
 * @param {number} a The first number in an addition.
 * @param {number} b The second number in an addition.
 * @returns {number} Returns the total.
 */
function add(a, b) {
  return a+b;
}`;
      commitFoo(fooComponentFixture);
    });
    it('should parse the documentation correctly', () => {
      const output = helper.runCmd('bit show @this/global/foo');
      expect(output.includes('No documentation found')).to.be.false;
      expect(output.includes('Description')).to.be.true;
      expect(output.includes('Adds two numbers.')).to.be.true;
      expect(output.includes('Args')).to.be.true;
      expect(output.includes('Returns')).to.be.true;
      expect(output.includes('number -> Returns the total.')).to.be.true;
    });
  });
});
