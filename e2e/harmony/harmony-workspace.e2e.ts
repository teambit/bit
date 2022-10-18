import chai, { expect } from 'chai';
import { loadBit } from '@teambit/bit';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { Component } from '@teambit/component';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('workspace aspect', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('tag a component twice', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild(); // 0.0.1
      helper.fixtures.populateComponents(1, undefined, 'v2');
      helper.command.tagAllWithoutBuild(); // 0.0.2
    });
    describe('ask the workspace for the first tag', () => {
      let component: Component;
      before(async () => {
        const harmony = await loadBit(helper.scopes.localPath);
        const workspace = harmony.get<Workspace>(WorkspaceAspect.id);
        const compId = await workspace.resolveComponentId('comp1@0.0.1');
        component = await workspace.get(compId);
      });
      // a previous bug, assigned the `component.state` of 0.0.2 to this 0.0.1 version
      it('should contain the files of the first tag not the second', () => {
        const content = component.state.filesystem.files[0].contents.toString();
        expect(content).not.to.contain('v2');
      });
    });
  });
});
