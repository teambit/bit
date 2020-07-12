import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';

chai.use(require('chai-fs'));

describe('create extension', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('react template', () => {
    let implFilePath;
    let testFilePath;
    let implContents;
    let testContents;
    const COMPONENT_NAME = 'foo';
    before(() => {
      helper.scopeHelper.initWorkspace();
      helper.fixtures.copyFixtureExtensions('react-create-template');
      helper.command.addComponent('react-create-template');
      helper.extensions.addExtensionToWorkspace('my-scope/react-create-template', {});
      helper.extensions.addExtensionToWorkspace('@teambit/create', { template: 'react-create-template' });
      helper.command.create(COMPONENT_NAME);
      const compDir = path.join(helper.scopes.localPath, `components/${COMPONENT_NAME}`);
      implFilePath = path.join(compDir, `${COMPONENT_NAME}.js`);
      testFilePath = path.join(compDir, `${COMPONENT_NAME}.spec.js`);
      implContents = fs.readFileSync(implFilePath).toString();
      testContents = fs.readFileSync(testFilePath).toString();
    });
    it('should create the component files', () => {
      expect(implFilePath).to.be.a.file();
      expect(testFilePath).to.be.a.file();
    });
    it('should add the files to bitmap', () => {
      const status = helper.command.status();
      expect(status).to.have.string('foo');
    });
    it('should use the template for the files', () => {
      expect(implContents).to.have.string(
        `export default function ${COMPONENT_NAME}() { console.log('hello react template'); }`
      );
      expect(testContents).to.have.string(
        `export default function ${COMPONENT_NAME}() { console.log('hello react template test'); }`
      );
    });
  });
});
