import chai, { expect } from 'chai';
import * as path from 'path';

import { BASE_WEB_DOMAIN } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import BitsrcTester, { supportTestingOnBitsrc, username } from '../bitsrc-tester';

chai.use(require('chai-fs'));

(supportTestingOnBitsrc ? describe : describe.skip)(
  `export --eject functionality using ${BASE_WEB_DOMAIN}`,
  function () {
    this.timeout(0);
    let helper: Helper;
    before(() => {
      helper = new Helper();
    });
    const bitsrcTester = new BitsrcTester();
    let scopeName;
    before(() => {
      return bitsrcTester
        .loginToBitSrc()
        .then(() => bitsrcTester.createScope())
        .then((scope) => {
          scopeName = scope;
        });
    });
    after(() => {
      return bitsrcTester.deleteScope(scopeName);
    });
    describe('as author', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents(`${username}.${scopeName} --eject`);
      });
      it('should delete the original component files from the file-system', () => {
        expect(path.join(helper.scopes.localPath, 'bar', 'foo.js')).not.to.be.a.path();
      });
      it('should have the component files as a package (in node_modules)', () => {
        expect(
          path.join(helper.scopes.localPath, 'node_modules', '@bit', `${username}.${scopeName}.bar.foo`, 'foo.js')
        ).to.be.a.path();
      });
      it('should delete the component from bit.map', () => {
        const bitMap = helper.bitMap.read();
        Object.keys(bitMap).forEach((id) => {
          expect(id).not.to.have.string('foo');
        });
      });
    });
  }
);
