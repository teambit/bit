import { expect } from 'chai';
import * as path from 'path';

import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

describe('bit deprecate and undeprecate commands', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('with local scope and corrupted bit.json', () => {
    let output;
    before(() => {
      helper.scopeHelper.initNewLocalScope();
    });
    it('should not deprecate component if bit.json is corrupted', () => {
      helper.bitJson.corrupt();
      try {
        helper.command.deprecateComponent('bar/foo2');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.scopes.localPath, 'bit.json')}`);
    });
  });
  describe('deprecate local tagged component', () => {
    let output;
    let scopeAfterDeprecation;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      output = helper.command.deprecateComponent('bar/foo');
      scopeAfterDeprecation = helper.scopeHelper.cloneLocalScope();
    });
    it('should show deprecated component', () => {
      expect(output).to.have.string('deprecated components: bar/foo');
    });
    it('should list components with deprecated components', () => {
      const listOutput = helper.command.listLocalScope();
      expect(listOutput).to.have.string('bar/foo [Deprecated]');
    });
    it('should export component as deprecated ', () => {
      helper.command.deprecateComponent('bar/foo');
      helper.command.exportAllComponents();
      output = helper.command.listRemoteScope(false);
      expect(output).to.have.string('bar/foo');
      expect(output).to.have.string('[Deprecated]');
    });
    describe('undeprecate local component', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterDeprecation);
        output = helper.command.undeprecateComponent('bar/foo');
      });
      it('should indicate the undeprecated components', () => {
        expect(output).to.have.string('undeprecated components: bar/foo');
      });
      it('bit list should not show the component as deprecated', () => {
        const listOutput = helper.command.listLocalScope();
        expect(listOutput).to.have.string('bar/foo');
        expect(listOutput).to.not.have.string('Deprecated');
      });
    });
  });
  describe('with remote scope', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportAllComponents();
      output = helper.command.deprecateComponent(`${helper.scopes.remote}/bar/foo`, '-r');
    });
    it('should deprecate remote component ', () => {
      expect(output).to.have.string(`deprecated components: ${helper.scopes.remote}/bar/foo`);
    });
    it('should list components all components including deprecated from remote scope', () => {
      const listOutput = helper.command.listRemoteScope(false);
      expect(listOutput).to.have.string('bar/foo');
      expect(listOutput).to.have.string('[Deprecated]');
    });
    it('should not deprecate remote component if not found ', () => {
      const depOutput = helper.command.deprecateComponent(`${helper.scopes.remote}/bar/foo111`, '-r');
      expect(depOutput).to.have.string(`missing components: ${helper.scopes.remote}/bar/foo`);
    });
    describe('undeprecate remote component', () => {
      before(() => {
        output = helper.command.undeprecateComponent(`${helper.scopes.remote}/bar/foo`, '-r');
      });
      it('should indicate the undeprecated components', () => {
        expect(output).to.have.string(`undeprecated components: ${helper.scopes.remote}/bar/foo`);
      });
      it('bit list should not show the component as deprecated', () => {
        const listOutput = helper.command.listLocalScope();
        expect(listOutput).to.have.string('bar/foo');
        expect(listOutput).to.not.have.string('Deprecated');
      });
    });
  });
  describe('with remote scope with dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should deprecate component that is being used by other components', () => {
      const output = helper.command.deprecateComponent(`${helper.scopes.remote}/utils/is-type`, '-r');
      expect(output).to.have.string(`deprecated components: ${helper.scopes.remote}/utils/is-type`);
    });
  });
});
