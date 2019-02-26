import { expect } from 'chai';
import Helper from '../e2e-helper';

const maxComponents = 3000;
const maxFlattenedDependencies = 100;

/**
 * as of v14.0.0
 * for 10,000 without dependencies
 * bit add ~3 minutes
 * bit tag: 1:50:35.67 total (1 hour and 50 minutes)
 *
 * for 3,000 with dependencies
 * without maxFlattenedDependencies => error Maximum call stack size exceeded
 * with maxFlattenedDependencies of 1,000 => 19:27.48 total
 * with maxFlattenedDependencies of 100 => 2:36.17 total
 */
describe('many components', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('basic commands', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const getImp = (index) => {
        if (index === 0) return '';
        if (index > maxFlattenedDependencies) {
          return `require('./comp${index - maxFlattenedDependencies}');`;
        }
        return `require('./comp${index - 1}');`;
      };
      for (let i = 0; i < maxComponents; i += 1) {
        helper.createFile('bar', `comp${i}.js`, getImp(i));
      }
    });
    describe('add command', () => {
      let addTimeInSeconds;
      before(() => {
        const start = process.hrtime();
        helper.addComponent('bar/*');
        [ addTimeInSeconds ] = process.hrtime(start);
      });
      it('should take less then 1 minutes to complete', () => {
        expect(addTimeInSeconds).to.be.lessThan(1 * 60);
      });
      describe('tag command', () => {
        let tagTimeInSeconds;
        before(() => {
          const start = process.hrtime();
          helper.tagAllComponents();
          [ tagTimeInSeconds ] = process.hrtime(start);
        });
        it('should take less then 5 minutes to complete', () => {
          expect(tagTimeInSeconds).to.be.lessThan(5 * 60);
        });
      });
    });
  });
});
