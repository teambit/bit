import fs from 'fs-extra';
import path from 'path';
import { expect } from 'chai';
import Helper from '../e2e-helper';

const barFooV1 = "module.exports = function foo() { return 'got foo'; };";
const barFooV2 = "module.exports = function foo() { return 'got foo v2'; };";

describe('bit use command', function () {
  this.timeout(0);
  const helper = new Helper();
  before(() => {
    helper.reInitLocalScope();
  });
  after(() => {
    helper.destroyEnv();
  });
  describe('for non existing component', () => {
    it('show an error saying the component was not found', () => {
      const output = helper.runWithTryCatch('bit use 1.0.0 utils/non-exist');
      expect(output).to.have.string('error: component "utils/non-exist" was not found');
    });
  });

  describe('after the component was created', () => {
    before(() => {
      helper.createComponentBarFoo(barFooV1);
      helper.addComponentBarFoo();
    });
    it('before tagging it should show an error saying the component was not tagged yet', () => {
      const output = helper.runWithTryCatch('bit use 1.0.0 bar/foo');
      expect(output).to.have.string("component bar/foo doesn't have any version yet");
    });
    describe('after the component was tagged', () => {
      before(() => {
        helper.tagAllWithoutMessage('', '0.0.5');
      });
      describe('using a non-exist version', () => {
        it('should show an error saying the version does not exist', () => {
          const output = helper.runWithTryCatch('bit use 1.0.0 bar/foo');
          expect(output).to.have.string("component bar/foo doesn't have version 1.0.0");
        });
      });
      describe('and component was modified', () => {
        before(() => {
          helper.createComponentBarFoo(barFooV2);
        });
        it('should show an error for now until is implemented', () => {
          const output = helper.runWithTryCatch('bit use 0.0.5 bar/foo');
          expect(output).to.have.string(
            'component bar/foo is modified, merging your changes is not supported just yet, please revert your local changes and try again'
          );
        });
        describe('and tagged again', () => {
          let output;
          before(() => {
            helper.tagAllWithoutMessage('', '0.0.10');
            output = helper.runWithTryCatch('bit use 0.0.5 bar/foo');
          });
          it.only('should display a successful message', () => {
            expect(output).to.have.string('the following components were switched to version');
            expect(output).to.have.string('0.0.5');
            expect(output).to.have.string('bar/foo');
          });
          it('should revert to v1', () => {
            const fooContent = fs.readFileSync(path.join(helper.localScopePath, 'bar/foo.js'));
            expect(fooContent).to.equal(barFooV1);
          });
          it('should not change the bitmap', () => {});
          it('should not show the component as modified', () => {});
        });
      });
    });
  });
});
