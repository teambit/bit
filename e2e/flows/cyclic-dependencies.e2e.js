import { expect } from 'chai';
import Helper from '../e2e-helper';

const fixtureA = `const b = require('./b');
console.log('got ' + b() + ' and got A')`;
const fixtureB = `const a = require('./a');
console.log('got ' + a() + ' and got B')`;

describe('cyclic dependencies', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('a => b, b => a (component A requires B, component B requires A)', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createFile('comp', 'a.js', fixtureA);
      helper.createFile('comp', 'b.js', fixtureB);
      helper.addComponent('comp/a.js');
      helper.addComponent('comp/b.js');
      output = helper.tagAllWithoutMessage();
    });
    it('should be able to tag both with no errors', () => {
      expect(output).to.have.string('2 components tagged');
    });
    it('should save the dependencies and flattenedDependencies of A correctly', () => {
      const compA = helper.catComponent('comp/a@0.0.1');
      expect(compA.dependencies[0].id).to.equal('comp/b@0.0.1');
      expect(compA.flattenedDependencies[0]).to.equal('comp/b@0.0.1');
    });
    it('should save the dependencies and flattenedDependencies of B correctly', () => {
      const compA = helper.catComponent('comp/b@0.0.1');
      expect(compA.dependencies[0].id).to.equal('comp/a@0.0.1');
      expect(compA.flattenedDependencies[0]).to.equal('comp/a@0.0.1');
    });
  });
});
