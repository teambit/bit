import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('update command', function () {
  let helper: Helper;
  this.timeout(0);
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('updates policies', function () {
    describe('policies added by the user', function () {
      let configFile;
      let componentJson;
      before(() => {
        helper.scopeHelper.reInitLocalScopeHarmony();
        helper.fixtures.populateComponents(2);
        helper.extensions.addExtensionToVariant('comp1', 'teambit.dependencies/dependency-resolver', {
          policy: {
            devDependencies: {
              'is-negative': '1.0.0',
            },
          },
        });
        helper.command.ejectConf('comp2/comp2');
        componentJson = helper.componentJson.read('comp2');
        delete componentJson.componentId.scope;
        componentJson.extensions = {
          'teambit.dependencies/dependency-resolver': {
            policy: {
              peerDependencies: {
                'is-odd': '1.0.0',
              },
            },
          },
        };
        helper.componentJson.write(componentJson, 'comp2');
        helper.command.install('is-positive@1.0.0');
        helper.command.update('--yes');
        configFile = helper.bitJsonc.read(helper.scopes.localPath);
        componentJson = helper.componentJson.read('comp2');
      });
      it('should update the version range', function () {
        expect(configFile['teambit.dependencies/dependency-resolver'].policy.dependencies['is-positive']).not.to.equal(
          '1.0.0'
        );
      });
      it('should update the root dependency version in node_modules', function () {
        expect(helper.fixtures.fs.readJsonFile(`node_modules/is-positive/package.json`).version).not.to.equal('1.0.0');
      });
      it('should update the version range in the variant', function () {
        expect(
          // eslint-disable-next-line
          configFile['teambit.workspace/variants']['comp1']['teambit.dependencies/dependency-resolver'].policy
            .devDependencies['is-negative']
        ).not.to.equal('1.0.0');
      });
      it('should update the variant dependency in node_modules', function () {
        expect(helper.fixtures.fs.readJsonFile(`node_modules/is-negative/package.json`).version).not.to.equal('1.0.0');
      });
      it('should update the version range in component.json', function () {
        expect(
          componentJson.extensions['teambit.dependencies/dependency-resolver'].policy.peerDependencies['is-odd']
        ).not.to.equal('1.0.0');
      });
      it('should update the component dependency in node_modules', function () {
        expect(helper.fixtures.fs.readJsonFile(`node_modules/is-odd/package.json`).version).not.to.equal('1.0.0');
      });
    });
  });
});
