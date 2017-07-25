// covers also init, create, commit commands and the js-doc parser

import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit show command', function () {
  this.timeout(0);
  const helper = new Helper();
  const commitFoo = (implementation) => {
    helper.cleanEnv();
    helper.runCmd('bit init');
    helper.createComponentBarFoo(implementation);
    helper.addComponentBarFoo();
    helper.commitComponentBarFoo();
  };
  after(() => {
    helper.destroyEnv();
  });

  describe.skip('local components', () => {
    describe('single version as cli output (no -v or -j flags)', () => {
      it('should render the id correctly', () => {

      });

      it('should render the language correctly', () => {

      });

      it('should render the language correctly', () => {

      });

      it('should render the tester correctly', () => {

      });

      it('should render the dependencies correctly', () => {

      });

      it('should render the package dependencies correctly', () => {

      });

      it('should render the files correctly', () => {

      });
    });

    describe('single version as json output', () => {
      // TODO: Make more test cases here
      it('should return correct json', () => {

      });
    });

    it('should throw an error if the -v flag provided', () => {

    });
  });

  describe.skip('remote components', () => {
    describe('single version as cli output (no -v or -j flags)', () => {
      it('should render the id correctly', () => {

      });

      it('should render the language correctly', () => {

      });

      it('should render the language correctly', () => {

      });

      it('should render the tester correctly', () => {

      });

      it('should render the dependencies correctly', () => {

      });

      it('should render the package dependencies correctly', () => {

      });
    });

    describe('all versions as cli output (without -j flag)', () => {
      it('should render the id correctly', () => {

      });

      it('should render the language correctly', () => {

      });

      it('should render the language correctly', () => {

      });

      it('should render the tester correctly', () => {

      });

      it('should render the dependencies correctly', () => {

      });

      it('should render the package dependencies correctly', () => {

      });
    });

    describe('single version as json output', () => {
      // TODO: Make more test cases here
      it('should return correct json', () => {

      });
    });

    describe('all versions as json output', () => {
      // TODO: Make more test cases here
      it('should return correct json', () => {

      });
    });
  });

  describe('with no docs', () => {
    before(() => {
      const fooComponentFixture = "module.exports = function foo() { return 'got foo'; };";
      commitFoo(fooComponentFixture);
    });
    it('should display "No documentation found" when there is no documentation', () => {
      const output = helper.runCmd('bit show bar/foo');
      expect(output.includes('No documentation found')).to.be.true;
    });
    it('should not show the "description" field', () => {
      const output = helper.runCmd('bit show bar/foo');
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
      const output = helper.runCmd('bit show bar/foo');
      expect(output.includes('No documentation found')).to.be.false;
      expect(output.includes('Description')).to.be.true;
      expect(output.includes('Adds two numbers.')).to.be.true;
      expect(output.includes('Args')).to.be.true;
      expect(output.includes('Returns')).to.be.true;
      expect(output.includes('number -> Returns the total.')).to.be.true;
    });
  });
});
