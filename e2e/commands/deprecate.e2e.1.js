import { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../fixtures/fixtures';

describe('bit deprecate and undeprecate commands', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('with local scope and corrupted bit.json', () => {
    let output;
    before(() => {
      helper.initNewLocalScope();
    });
    it('should not deprecate component if bit.json is corrupted', () => {
      helper.bitJson.corruptBitJson();
      try {
        helper.command.deprecateComponent('bar/foo2');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.localScopePath, 'bit.json')}`);
    });
  });
  describe('deprecate local tagged component', () => {
    let output;
    let scopeAfterDeprecation;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      output = helper.command.deprecateComponent('bar/foo');
      scopeAfterDeprecation = helper.cloneLocalScope();
    });
    it('should show deprecated component', () => {
      expect(output).to.have.string('deprecated components: bar/foo');
    });
    it('should list components with deprecated components', () => {
      const listOutput = helper.command.listLocalScope();
      expect(listOutput).to.contain.string('bar/foo [Deprecated]');
    });
    it('should export component as deprecated ', () => {
      helper.command.deprecateComponent('bar/foo');
      helper.command.exportAllComponents();
      output = helper.command.listRemoteScope(false);
      expect(output).to.contain.string('bar/foo');
      expect(output).to.contain.string('[Deprecated]');
    });
    describe('undeprecate local component', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterDeprecation);
        output = helper.command.undeprecateComponent('bar/foo');
      });
      it('should indicate the undeprecated components', () => {
        expect(output).to.have.string('undeprecated components: bar/foo');
      });
      it('bit list should not show the component as deprecated', () => {
        const listOutput = helper.command.listLocalScope();
        expect(listOutput).to.contain.string('bar/foo');
        expect(listOutput).to.not.contain.string('Deprecated');
      });
    });
  });
  describe('with remote scope', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportAllComponents();
      output = helper.command.deprecateComponent(`${helper.remoteScope}/bar/foo`, '-r');
    });
    it('should deprecate remote component ', () => {
      expect(output).to.contain.string(`deprecated components: ${helper.remoteScope}/bar/foo`);
    });
    it('should list components all components including deprecated from remote scope', () => {
      const listOutput = helper.command.listRemoteScope(false);
      expect(listOutput).to.contain.string('bar/foo');
      expect(listOutput).to.contain.string('[Deprecated]');
    });
    it('should not deprecate remote component if not found ', () => {
      const depOutput = helper.command.deprecateComponent(`${helper.remoteScope}/bar/foo111`, '-r');
      expect(depOutput).to.contain.string(`missing components: ${helper.remoteScope}/bar/foo`);
    });
    describe('undeprecate remote component', () => {
      before(() => {
        output = helper.command.undeprecateComponent(`${helper.remoteScope}/bar/foo`, '-r');
      });
      it('should indicate the undeprecated components', () => {
        expect(output).to.have.string(`undeprecated components: ${helper.remoteScope}/bar/foo`);
      });
      it('bit list should not show the component as deprecated', () => {
        const listOutput = helper.command.listLocalScope();
        expect(listOutput).to.contain.string('bar/foo');
        expect(listOutput).to.not.contain.string('Deprecated');
      });
    });
  });
  describe('with remote scope with dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should deprecate component that is being used by other components', () => {
      const output = helper.command.deprecateComponent(`${helper.remoteScope}/utils/is-type`, '-r');
      expect(output).to.contain.string(`deprecated components: ${helper.remoteScope}/utils/is-type`);
    });
  });
});
