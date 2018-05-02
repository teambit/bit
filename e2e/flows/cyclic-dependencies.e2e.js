import { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

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
  describe('a complex case with a long chain of dependencies', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      // isString => isType
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponent('utils/is-type.js');
      helper.addComponent('utils/is-string.js');
      helper.tagAllWithoutMessage();

      // A1 => A2 => A3 (leaf)
      // B1 => B2 => B3 => B4
      // A1 => B1, B2 => A1
      // B4 => is-string => is-type (leaf)
      helper.createFile('comp', 'A1.js', "const A2 = require('./A2'); const B1 = require ('./B1');");
      helper.createFile('comp', 'A2.js', "const A3 = require('./A3')");
      helper.createFile('comp', 'A3.js', "console.log('Im a leaf')");
      helper.createFile('comp', 'B1.js', "const B2 = require('./B2');");
      helper.createFile('comp', 'B2.js', "const B3 = require('./B3'); const A1 = require ('./A1');");
      helper.createFile('comp', 'B3.js', "const B4 = require('./B4')");
      helper.createFile('comp', 'B4.js', "const isString = require('../utils/is-string')");
      helper.addComponent('comp/*.js');
      output = helper.tagAllWithoutMessage();
    });
    it('should be able to tag with no errors', () => {
      expect(output).to.have.string('7 components tagged');
    });
    it('leaves (A3 and is-type) should not have any dependency', () => {
      const leaves = ['comp/a3@latest', 'utils/is-type@latest'];
      leaves.forEach((leaf) => {
        const catComp = helper.catComponent(leaf);
        expect(catComp.dependencies).to.have.lengthOf(0);
        expect(catComp.flattenedDependencies).to.have.lengthOf(0);
      });
    });
    // A2 => A3 (leaf)
    it('A2 should have only A3 as a dependency and flattenedDependency', () => {
      const A2 = helper.catComponent('comp/a2@latest');
      expect(A2.dependencies).to.have.lengthOf(1);
      expect(A2.flattenedDependencies).to.have.lengthOf(1);
      expect(A2.dependencies[0].id).to.equal('comp/a3@0.0.1');
      expect(A2.flattenedDependencies[0]).to.equal('comp/a3@0.0.1');
    });
    // A1 => A2 => A3 (leaf). A1 => B1. B1 => B2 => B3 => B4.
    it('A1 should have A2 and B1 as direct dependencies, and all the rest as flattenedDependencies', () => {
      const A1 = helper.catComponent('comp/a1@latest');
      expect(A1.dependencies).to.have.lengthOf(2);
      const dependenciesIds = A1.dependencies.map(dep => dep.id);
      expect(dependenciesIds).to.include('comp/a2@0.0.1');
      expect(dependenciesIds).to.include('comp/b1@0.0.1');
      expect(A1.flattenedDependencies).to.have.lengthOf(8);
      expect(A1.flattenedDependencies).to.include('comp/a2@0.0.1');
      expect(A1.flattenedDependencies).to.include('comp/a3@0.0.1');
      expect(A1.flattenedDependencies).to.include('comp/b1@0.0.1');
      expect(A1.flattenedDependencies).to.include('comp/b2@0.0.1');
      expect(A1.flattenedDependencies).to.include('comp/b3@0.0.1');
      expect(A1.flattenedDependencies).to.include('comp/b4@0.0.1');
      expect(A1.flattenedDependencies).to.include('utils/is-type@0.0.1');
      expect(A1.flattenedDependencies).to.include('utils/is-string@0.0.1');
    });
    // B2 => B3 => B4. B2 => A1. A1 => A2 => A3 (leaf). A1 => B1.
    it('B2 should have A1 and B3 as direct dependencies, and all the rest as flattenedDependencies', () => {
      const B2 = helper.catComponent('comp/b2@latest');
      expect(B2.dependencies).to.have.lengthOf(2);
      const dependenciesIds = B2.dependencies.map(dep => dep.id);
      expect(dependenciesIds).to.include('comp/b3@0.0.1');
      expect(dependenciesIds).to.include('comp/a1@0.0.1');
      expect(B2.flattenedDependencies).to.have.lengthOf(8);
      expect(B2.flattenedDependencies).to.include('comp/a2@0.0.1');
      expect(B2.flattenedDependencies).to.include('comp/a3@0.0.1');
      expect(B2.flattenedDependencies).to.include('comp/a1@0.0.1');
      expect(B2.flattenedDependencies).to.include('comp/b1@0.0.1');
      expect(B2.flattenedDependencies).to.include('comp/b3@0.0.1');
      expect(B2.flattenedDependencies).to.include('comp/b4@0.0.1');
      expect(B2.flattenedDependencies).to.include('utils/is-type@0.0.1');
      expect(B2.flattenedDependencies).to.include('utils/is-string@0.0.1');
    });
    // B1 => B2 => B3 => B4. B2 => A1. A1 => A2 => A3 (leaf)
    it('B1 should have B2 as direct dependencies, and all the rest as flattenedDependencies', () => {
      const B1 = helper.catComponent('comp/b1@latest');
      expect(B1.dependencies).to.have.lengthOf(1);
      const dependenciesIds = B1.dependencies.map(dep => dep.id);
      expect(dependenciesIds).to.include('comp/b2@0.0.1');
      expect(B1.flattenedDependencies).to.have.lengthOf(8);
      expect(B1.flattenedDependencies).to.include('comp/a2@0.0.1');
      expect(B1.flattenedDependencies).to.include('comp/a3@0.0.1');
      expect(B1.flattenedDependencies).to.include('comp/a1@0.0.1');
      expect(B1.flattenedDependencies).to.include('comp/b2@0.0.1');
      expect(B1.flattenedDependencies).to.include('comp/b3@0.0.1');
      expect(B1.flattenedDependencies).to.include('comp/b4@0.0.1');
      expect(B1.flattenedDependencies).to.include('utils/is-type@0.0.1');
      expect(B1.flattenedDependencies).to.include('utils/is-string@0.0.1');
    });
    // B3 => B4 => is-string => is-type (leaf)
    it('B3 should have B4 as direct dependencies, and B4, is-type, is-string as flattenedDependencies', () => {
      const B3 = helper.catComponent('comp/b3@latest');
      expect(B3.dependencies).to.have.lengthOf(1);
      const dependenciesIds = B3.dependencies.map(dep => dep.id);
      expect(dependenciesIds).to.include('comp/b4@0.0.1');
      expect(B3.flattenedDependencies).to.have.lengthOf(3);
      expect(B3.flattenedDependencies).to.include('comp/b4@0.0.1');
      expect(B3.flattenedDependencies).to.include('utils/is-type@0.0.1');
      expect(B3.flattenedDependencies).to.include('utils/is-string@0.0.1');
    });
    // B4 => is-string => is-type (leaf)
    it('B4 should have is-string as a direct dependency, and is-type, is-string as flattenedDependencies', () => {
      const B4 = helper.catComponent('comp/b4@latest');
      expect(B4.dependencies).to.have.lengthOf(1);
      const dependenciesIds = B4.dependencies.map(dep => dep.id);
      expect(dependenciesIds).to.include('utils/is-string@0.0.1');
      expect(B4.flattenedDependencies).to.have.lengthOf(2);
      expect(B4.flattenedDependencies).to.include('utils/is-type@0.0.1');
      expect(B4.flattenedDependencies).to.include('utils/is-string@0.0.1');
    });
  });
});
