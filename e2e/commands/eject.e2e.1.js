import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';
import BitsrcTester, { username, supportTestingOnBitsrc } from '../bitsrc-tester';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import * as fixtures from '../fixtures/fixtures';
import { ComponentNotFound } from '../../src/scope/exceptions';
import { failureEjectMessage, successEjectMessage } from '../../src/cli/commands/public-cmds/eject-cmd';

chai.use(require('chai-fs'));

describe('bit eject command', function () {
  this.timeout(0);
  const helper = new Helper();
  const bitsrcTester = new BitsrcTester();
  describe('local component', () => {
    before(() => {
      helper.reInitLocalScope();
    });
    describe('non existing component', () => {
      it('show an error saying the component was not found', () => {
        const useFunc = () => helper.ejectComponents('utils/non-exist');
        const error = new ComponentNotFound('utils/non-exist');
        helper.expectToThrow(useFunc, error);
      });
    });
    describe('tagged component before export', () => {
      let output;
      before(() => {
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.tagAllWithoutMessage();
        output = helper.ejectComponents('bar/foo');
      });
      it('should indicate that local components cannot be ejected', () => {
        expect(output).to.have.string(failureEjectMessage);
      });
    });
  });

  (supportTestingOnBitsrc ? describe : describe.skip)('using bitsrc', function () {
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
      helper.destroyEnv();
      return bitsrcTester.deleteScope(scopeName);
    });
    describe('as author', () => {
      let ejectOutput;
      let scopeBeforeEject;
      before(() => {
        helper.reInitLocalScope();
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.tagAllWithoutMessage();
        helper.exportAllComponents(`${username}.${scopeName}`);
        scopeBeforeEject = helper.cloneLocalScope();
      });
      describe('eject from consumer root', () => {
        before(() => {
          ejectOutput = helper.ejectComponents('bar/foo');
        });
        it('should indicate that the eject was successful', () => {
          expect(ejectOutput).to.have.string(successEjectMessage);
        });
        it('should save the component in package.json', () => {
          const packageJson = helper.readPackageJson();
          expect(packageJson).to.have.property('dependencies');
          const packageName = `@bit/${username}.${scopeName}.bar.foo`;
          expect(packageJson.dependencies).to.have.property(packageName);
          expect(packageJson.dependencies[packageName]).to.equal('0.0.1');
        });
        it('should have the component files as a package (in node_modules)', () => {
          const fileInPackage = path.join('node_modules/@bit', `${username}.${scopeName}.bar.foo`, 'foo.js');
          expect(path.join(helper.localScopePath, fileInPackage)).to.be.a.path();
          const fileContent = helper.readFile(fileInPackage);
          expect(fileContent).to.equal(fixtures.fooFixture);
        });
        it('should delete the original component files from the file-system', () => {
          expect(path.join(helper.localScopePath, 'bar', 'foo.js')).not.to.be.a.path();
        });
        it('should delete the component from bit.map', () => {
          const bitMap = helper.readBitMap();
          Object.keys(bitMap).forEach((id) => {
            expect(id).not.to.have.string('foo');
          });
        });
        it('bit status should show a clean state', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
        });
        it('should not delete the objects from the scope', () => {
          const listScope = helper.listLocalScopeParsed('--scope');
          expect(listScope[0].id).to.have.string('foo');
        });
      });
      describe('eject from an inner directory', () => {
        before(() => {
          helper.getClonedLocalScope(scopeBeforeEject);
          ejectOutput = helper.runCmd('bit eject bar/foo', path.join(helper.localScopePath, 'bar'));
        });
        it('should indicate that the eject was successful', () => {
          expect(ejectOutput).to.have.string('success');
        });
        it('should save the component in package.json', () => {
          const packageJson = helper.readPackageJson();
          expect(packageJson).to.have.property('dependencies');
          const packageName = `@bit/${username}.${scopeName}.bar.foo`;
          expect(packageJson.dependencies).to.have.property(packageName);
          expect(packageJson.dependencies[packageName]).to.equal('0.0.1');
        });
        it('should have the component files as a package (in node_modules)', () => {
          const fileInPackage = path.join('node_modules/@bit', `${username}.${scopeName}.bar.foo`, 'foo.js');
          expect(path.join(helper.localScopePath, fileInPackage)).to.be.a.path();
          const fileContent = helper.readFile(fileInPackage);
          expect(fileContent).to.equal(fixtures.fooFixture);
        });
        it('should delete the original component files from the file-system', () => {
          expect(path.join(helper.localScopePath, 'bar', 'foo.js')).not.to.be.a.path();
        });
        it('should delete the component from bit.map', () => {
          const bitMap = helper.readBitMap();
          Object.keys(bitMap).forEach((id) => {
            expect(id).not.to.have.string('foo');
          });
        });
        it('bit status should show a clean state', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
        });
        it('should not delete the objects from the scope', () => {
          const listScope = helper.listLocalScopeParsed('--scope');
          expect(listScope[0].id).to.have.string('foo');
        });
      });
    });
  });
});
