import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

const helper = new Helper();

describe('angular', function () {
  this.timeout(0);
  after(() => {
    helper.destroyEnv();
  });
  describe('importing an ngx-bootstrap component from staging', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.setProjectAsAngular();
      helper.runCmd('bit import david.ngx/buttons');
    });
    it('bit status should show an error about missing tsconfig.json', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.have.string('failed finding tsconfig.json file');
    });
    describe('after creating tsconfig.json file', () => {
      before(() => {
        helper.outputFile('tsconfig.json');
      });
      it('bit status should show a clean state', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);
      });
    });
  });
  describe('ng-lightning', () => {
    let localWorkspace;
    before(() => {
      helper.runCmd('git clone https://github.com/ng-lightning/ng-lightning');
      helper.runCmd('git checkout v4.8.1', path.join(helper.localScopePath, 'ng-lightning'));
      localWorkspace = path.join(helper.localScopePath, 'ng-lightning/projects/ng-lightning');
      helper.runCmd('bit init', localWorkspace);
      helper.runCmd('bit add src/lib/badges', localWorkspace);
    });
    describe('isolating a component that has public_api.js on the root dir', () => {
      before(() => {
        helper.runCmd('bit isolate badges --use-capsule -d my-capsule', localWorkspace);
      });
      it('should not override the public_api.ts file with the generated entry-point file with the same name', () => {
        const publicApi = fs.readFileSync(path.join(localWorkspace, 'my-capsule/public_api.ts')).toString();
        expect(publicApi).to.have.string("export * from './badge'");
        expect(publicApi).to.not.have.string("export * from './index'");
      });
    });
  });
});
