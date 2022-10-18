import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('artifacts storage resolver', function () {
  this.timeout(0);
  let helper: Helper;
  let envId;
  let envName;
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setNewLocalAndRemoteScopes();
    helper.bitJsonc.setupDefault();
    // helper.bitJsonc.setPackageManager();
    envName = helper.env.setCustomEnv('elements-storage-resolver-env');
    envId = `${helper.scopes.remote}/${envName}`;
    helper.fixtures.populateComponents(1, undefined, undefined, undefined, true);
    helper.extensions.addExtensionToVariant('*', envId);
    helper.command.compile();
    helper.command.tagAllComponents();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('store url from storage resolver on local scope', () => {
    it('should store the urls for the artifacts', () => {
      const comp1 = helper.command.catComponent('comp1@latest');
      const files = getElementsArtifactsFromModel(comp1);
      files.forEach((file) => {
        const url = file.url;
        expect(url).to.equal(`http://fake-url/${file.relativePath}`);
      });
    });
  });
  describe('store url from storage resolver on remote scope', () => {
    before(() => {
      helper.command.export();
    });
    it('should store the urls for the artifacts', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`, helper.scopes.remotePath);
      const files = getElementsArtifactsFromModel(comp1);
      files.forEach((file) => {
        const url = file.url;
        expect(url).to.equal(`http://fake-url/${file.relativePath}`);
      });
    });
    describe('store url from storage resolver after import', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('comp1');
      });
      it('should store the urls for the artifacts', () => {
        const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`, helper.scopes.remotePath);
        const files = getElementsArtifactsFromModel(comp1);
        files.forEach((file) => {
          const url = file.url;
          expect(url).to.equal(`http://fake-url/${file.relativePath}`);
        });
      });
    });
  });
});

type ArtifactFile = { relativePath: string; file: string; url?: string };
function getElementsArtifactsFromModel(compModel: any): ArtifactFile[] {
  const builderEntry = compModel.extensions.find((ext) => ext.name === 'teambit.pipelines/builder');
  const artifacts = builderEntry.data.artifacts;
  const elementsArtifact = artifacts.find((artifact) => artifact.name === 'elements');
  return elementsArtifact.files;
}
