/* eslint no-console: 0 */

import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

const MAX_FILES_READ = 1050;
const MAX_FILES_READ_STATUS = 1500;

/**
 * as of now (2025/03/03) 1,030 files are loaded during bit-bootstrap.
 * for "bit status", around 1,433 files are loaded.
 *
 * two weeks ago we were at 2,964 files. a few PRs helped to reduce the number of files. among them:
 * #9568, #9572, #9576, #9577, #9578, #9584, #9587, #9588, #9590, #9593, #9594, #9598.
 * it can be helpful to take a look into those PRs in the future in case the number grows.
 */
describe('Filesystem read count', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('basic commands', () => {
    describe('bit --help', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
      });
      it('should not exceed a reasonable file-count number', () => {
        const output = helper.command.runCmd('bit --help', undefined, undefined, undefined, undefined, { 'BIT_DEBUG_READ_FILE': 'true' });
        expect(output).to.have.string('0');
        expect(output).to.have.string('package.json');
        expect(output).to.have.string('node_modules');
        expect(output).to.not.have.string(`#${MAX_FILES_READ}`);
      });
      it('should take less than a second to run bit --help', () => {
        const start = process.hrtime();
        helper.command.runCmd('bit --help');
        const [timeInSeconds, nanoseconds] = process.hrtime(start);
        const timeInMs = timeInSeconds * 1000 + nanoseconds / 1_000_000;
        // On my Mac M1, as of 2025/03/03, it takes 312ms.
        console.log('bit --help load time in milliseconds: ', Math.floor(timeInMs));
        expect(timeInSeconds).to.be.lessThan(1);
      });
    });
    describe('bit status', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateComponents(1);
      });
      it('should not exceed a reasonable file-count number', () => {
        const output = helper.command.runCmd('bit status', undefined, undefined, undefined, undefined, { 'BIT_DEBUG_READ_FILE': 'true' });
        expect(output).to.not.have.string(`#${MAX_FILES_READ_STATUS}`);
      });
      it('should take less than 2 seconds', () => {
        const start = process.hrtime();
        helper.command.runCmd('bit status');
        const [timeInSeconds, nanoseconds] = process.hrtime(start);
        expect(timeInSeconds).to.be.lessThan(2);
        const timeInMs = timeInSeconds * 1000 + nanoseconds / 1_000_000;
        // On my Mac M1, as of 2025/03/03, it takes 500ms.
        console.log('bit status load time in milliseconds: ', Math.floor(timeInMs));
      });
    });
  });
});