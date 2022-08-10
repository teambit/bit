import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('dev files', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('custom env that changes dev files patterns', () => {
    let envId;
    let envName;
    let showOutput;
    let devFiles;
    const ENV_NAME = 'dev-files-env';
    const COMP_NAME = 'custom-dev-files';
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.bitJsonc.setPackageManager();
      envName = helper.env.setCustomEnv(ENV_NAME);
      envId = `${helper.scopes.remote}/${envName}`;
      // helper.fixtures.createComponentBarFoo();
      helper.fixtures.copyFixtureComponents(COMP_NAME);
      helper.command.addComponent(COMP_NAME);

      helper.extensions.addExtensionToVariant('*', envId);
      helper.command.compile();
      showOutput = helper.command.showComponentParsedHarmony(COMP_NAME);
      devFiles = showOutput.find(item => item.title === 'dev files').json;
    });
    it('should show registered custom dev file as dev file', () => {
      const fullEnvName = `${helper.scopes.remote}/${envName}`;
      const envDevFiles = devFiles[fullEnvName];
      expect(envDevFiles).to.include('file.custom-dev-file.js');
    });
    describe('test files', () => {
      it('should show registered custom test file as dev file', () => {
        const testFiles = devFiles['teambit.defender/tester'];
        expect(testFiles).to.include('custom-dev-files.registered-test.spec.js');
      });
      it('should not show default test file as dev file', () => {
        const testFiles = devFiles['teambit.defender/tester'];
        expect(testFiles).to.not.include('custom-dev-files.spec.js');
      });
    });
    it('should show registered custom docs file as dev file', () => {
      const docsFiles = devFiles['teambit.docs/docs'];
      expect(docsFiles).to.include('comp.custom-docs-suffix.mdx');
    });
    it('should show registered custom composition file as dev file', () => {
      const compositionsFiles = devFiles['teambit.compositions/compositions'];
      expect(compositionsFiles).to.include('comp.custom-composition-suffix.tsx');
    });
  });
});
