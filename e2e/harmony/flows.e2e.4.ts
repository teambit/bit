import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

// @todo: since the introduction of Environment extension, the flows config should not be set
// on the component but inside the env. We'll need to figure out how to get it to work
describe.skip('flows functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  (IS_WINDOWS ? describe.skip : describe)('running build task', () => {
    let taskOutput;
    before(() => {
      helper.scopeHelper.initWorkspaceAndRemoteScope();
      helper.bitJsonc.addDefaultScope();
      helper.fixtures.populateComponentsTS();
      helper.fixtures.addExtensionTS();
      const tsExtensionKey = `${helper.scopes.remote}/extensions/typescript`;

      const flowExtensionConfig = {
        tasks: {
          build: [`@bit/${helper.scopes.remote}.extensions.typescript:transpile`],
        },
      };
      helper.extensions.addExtensionToVariant('*', tsExtensionKey, {});
      helper.extensions.addExtensionToVariant('*', 'flows', flowExtensionConfig);

      taskOutput = helper.command.runTask('build comp1');
    });
    it('should output results', () => {
      expect(taskOutput).to.have.string('Flows executed');
    });
    it('should write dists files', () => {
      const helpCapsule = helper.command.getCapsuleOfComponent('comp1');
      expect(path.join(helpCapsule, 'dist')).to.be.a.directory();
      expect(path.join(helpCapsule, 'dist/index.js')).to.be.a.file();
    });
    describe('imported component', () => {
      before(() => {
        helper.command.tagAllComponents();
        helper.command.export();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('comp1');
      });
      it('should import the extensions as well into the scope', () => {
        const scopeList = helper.command.listLocalScopeParsed('--scope');
        const ids = scopeList.map((entry) => entry.id);
        expect(ids).to.include(`${helper.scopes.remote}/extensions/typescript`);
      });
      it('should not show the component as modified', () => {
        helper.command.expectStatusToBeClean();
      });
      describe('running compile on the imported component', () => {
        before(() => {
          helper.command.runTask('build comp1');
        });
        it('should generate dists on the capsule', () => {
          const capsulePath = helper.command.getCapsuleOfComponent('comp1@0.0.1');
          expect(path.join(capsulePath, 'dist')).to.be.a.directory();
          expect(path.join(capsulePath, 'dist/index.js')).to.be.a.file();
        });
        it('should generate dists also after deleting the dists from the capsule', () => {
          const capsulePath = helper.command.getCapsuleOfComponent('comp1@0.0.1');
          fs.removeSync(path.join(capsulePath, 'dist'));
          helper.command.runTask('build comp1 --no-cache');
          expect(path.join(capsulePath, 'dist')).to.be.a.directory();
          expect(path.join(capsulePath, 'dist/index.js')).to.be.a.file();
        });
      });
    });
  });
});
