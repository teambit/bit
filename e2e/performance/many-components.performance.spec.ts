/* eslint no-console: 0 */
import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

const maxComponents = 100; // 3K should work as well but it regressed
const maxFlattenedDependencies = 10;

/**
 * Performance log according to David's MacBook pro 2018.
 * 2.6 GHz Intel Core i7, 16GB RAM.
 *
 * as of v14.0.0
 * for 10,000 without dependencies
 * bit add ~3 minutes
 * bit tag: 1:50:35.67 total (1 hour and 50 minutes)
 *
 * for 3,000 with dependencies, bit tag
 * without maxFlattenedDependencies => error Maximum call stack size exceeded
 * with maxFlattenedDependencies of 1,000 => 19:27.48 total
 * with maxFlattenedDependencies of 100 => 2:36.17 total
 *
 * v14.0.6
 * status 3,000 with maxFlattenedDependencies of 100 => 54.775 total (54 seconds)
 * export 3,000 with maxFlattenedDependencies of 100 => 2:30.54 total
 * import 3,000 with maxFlattenedDependencies of 100 => after 11:48.83 total threw error JavaScript heap out of memory
 * import 300 with maxFlattenedDependencies of 10 => 24.240 total
 *
 * v14.0.7
 * import 3,000 with maxFlattenedDependencies of 100 => 13:26.57 total
 * import 300 with maxFlattenedDependencies of 10 => 13.641 total
 *
 * v14.2.3 (another change here. node is v8, not v6)
 * add 3,000 with maxFlattenedDependencies of 100 => 7 sec
 * tag 3,000 with maxFlattenedDependencies of 100 => 137 sec
 * status 3,000 with maxFlattenedDependencies of 100 => 46 sec
 * export 3,000 with maxFlattenedDependencies of 100 => 90 sec
 * import 3,000 with maxFlattenedDependencies of 100 => 475 sec
 *
 * v14.8.7 (with node v12.7.0)
 * add 3,000 with maxFlattenedDependencies of 100 => 10 sec
 * tag 3,000 with maxFlattenedDependencies of 100 => 269 sec
 * status 3,000 with maxFlattenedDependencies of 100 => 203 sec
 * export 3,000 with maxFlattenedDependencies of 100 => 125 sec + an error "got an error from the logger Error: write after end"
 * import 3,000 with maxFlattenedDependencies of 100 => 949 sec
 *
 * v14.8.8 (with node v12.7.0)
 * add 3,000 with maxFlattenedDependencies of 100 => 7 sec
 * tag 3,000 with maxFlattenedDependencies of 100 => 88 sec
 * status 3,000 with maxFlattenedDependencies of 100 => 47 sec
 * export 3,000 with maxFlattenedDependencies of 100 => 94 sec
 * import 3,000 with maxFlattenedDependencies of 100 => 736 sec
 */

describe('many components Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('basic commands', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const getImp = (index) => {
        if (index === 0) return '';
        if (index > maxFlattenedDependencies) {
          return `require('../comp${index - maxFlattenedDependencies}');`;
        }
        return `require('../comp${index - 1}');`;
      };
      for (let i = 0; i < maxComponents; i += 1) {
        helper.fs.outputFile(`bar/comp${i}/index.js`, getImp(i));
      }
    });
    describe('add command', () => {
      let addTimeInSeconds;
      before(() => {
        const start = process.hrtime();
        helper.command.addComponent('bar/*');
        [addTimeInSeconds] = process.hrtime(start);
        console.log('addTimeInSeconds', addTimeInSeconds);
      });
      it('should take less then 8 seconds to complete', () => {
        expect(addTimeInSeconds).to.be.lessThan(8);
      });
      describe('link --rewire command', () => {
        let linkTimeInSeconds;
        before(() => {
          const start = process.hrtime();
          helper.command.linkAndRewire();
          [linkTimeInSeconds] = process.hrtime(start);
          console.log('tagTimeInSeconds', linkTimeInSeconds);
        });
        it('should take less then 14 seconds to complete', () => {
          expect(linkTimeInSeconds).to.be.lessThan(14);
        });
        describe('tag command', () => {
          let tagTimeInSeconds;
          before(() => {
            // helper.command.compile();
            const start = process.hrtime();
            helper.command.tagAllComponents();
            [tagTimeInSeconds] = process.hrtime(start);
            console.log('tagTimeInSeconds', tagTimeInSeconds);
          });
          it('should take less then 50 seconds to complete', () => {
            expect(tagTimeInSeconds).to.be.lessThan(50);
          });
          describe('status command after tag', () => {
            let statusTimeInSeconds;
            before(() => {
              const start = process.hrtime();
              helper.command.status();
              [statusTimeInSeconds] = process.hrtime(start);
              console.log('statusTimeInSeconds', statusTimeInSeconds);
            });
            it('should take less then 8 seconds to complete', () => {
              expect(statusTimeInSeconds).to.be.lessThan(8);
            });
          });
          describe('export command', () => {
            let exportTimeInSeconds;
            before(() => {
              const start = process.hrtime();
              helper.command.export();
              [exportTimeInSeconds] = process.hrtime(start);
              console.log('exportTimeInSeconds', exportTimeInSeconds);
            });
            it('should take less then 12 seconds to complete', () => {
              expect(exportTimeInSeconds).to.be.lessThan(12);
            });
            describe('import command', () => {
              let importTimeInSeconds;
              before(() => {
                const start = process.hrtime();
                helper.command.runCmd('bit import');
                [importTimeInSeconds] = process.hrtime(start);
                console.log('importTimeInSeconds', importTimeInSeconds);
              });
              it('should take less then 10 seconds to complete', () => {
                expect(importTimeInSeconds).to.be.lessThan(10);
              });
            });
          });
        });
      });
    });
  });
});

const MB = 1024 * 1024;
const randomStr = (sizeInMB: number) =>
  Array(sizeInMB * MB + 1)
    .join('a')
    .split('a')
    .map(() => Math.random().toString(36).charAt(2))
    .join('');
const MAX_HEAVY_COMPONENTS = 10;
const SIZE_IN_MB = 10;
describe('heavy components Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('basic commands', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes({ disablePreview: false });
      const getImp = () => {
        const hugeStr = randomStr(SIZE_IN_MB);
        return `console.log('${hugeStr}');`;
      };
      for (let i = 0; i < MAX_HEAVY_COMPONENTS; i += 1) {
        helper.fs.outputFile(`bar/comp${i}/index.js`, getImp());
      }
    });
    describe('add command', () => {
      let addTimeInSeconds;
      before(() => {
        const start = process.hrtime();
        helper.command.addComponent('bar/* -n david');
        [addTimeInSeconds] = process.hrtime(start);
        console.log('addTimeInSeconds', addTimeInSeconds);
      });
      it('should take less then 8 seconds to complete', () => {
        expect(addTimeInSeconds).to.be.lessThan(8);
      });
      describe('tag command', () => {
        let tagTimeInSeconds;
        before(() => {
          // helper.command.compile();
          const start = process.hrtime();
          helper.command.tagAllComponents();
          [tagTimeInSeconds] = process.hrtime(start);
          console.log('tagTimeInSeconds', tagTimeInSeconds);
        });
        it('should take less then 40 seconds to complete', () => {
          expect(tagTimeInSeconds).to.be.lessThan(40);
        });
      });
    });
  });
});
