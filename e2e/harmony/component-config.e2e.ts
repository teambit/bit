import chai, { expect } from 'chai';
import GeneralHelper from '../../src/e2e-helper/e2e-general-helper';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { ComponentConfigFileAlreadyExistsError } from '../../src/extensions/workspace';

chai.use(require('chai-fs'));

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('component config', function() {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('eject config', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
    });
    describe('eject for new component', () => {
      let output;
      let alignedOutput;
      let componentJsonPath;
      before(() => {
        output = helper.command.ejectConf('bar/foo');
        componentJsonPath = helper.componentJson.composePath('bar');
      });
      it('expect to output the path of the config', () => {
        alignedOutput = GeneralHelper.alignOutput(output);
        expect(alignedOutput).to.have.string(getSuccessEjectMsg('bar/foo', componentJsonPath));
      });
      it('expect to write a component json file', () => {
        expect(componentJsonPath).to.be.a.file();
      });
      describe('component json content', () => {
        let componentJson;
        before(() => {
          componentJson = helper.componentJson.read('bar');
        });
        it('expect to have the component id', () => {
          expect(componentJson.componentId).to.deep.equal({
            // TODO: once we use the scope from default scope all over the place, this might be needed
            // scope: helper.scopes.local,
            name: 'bar/foo'
          });
        });
        it('expect to have the propagate false by default', () => {
          expect(componentJson.propagate).to.be.false;
        });
        it('expect to write a component json with no extensions', () => {
          expect(componentJson.extensions).to.be.empty;
        });
      });
      describe('using propagate true flag', () => {
        let componentJson;
        before(() => {
          // Clean from previous test (faster then re-create the entire scope)
          helper.componentJson.deleteIfExist();
          output = helper.command.ejectConf('bar/foo', { propagate: true });
          componentJson = helper.componentJson.read('bar');
        });
        it('expect to have the propagate true', () => {
          expect(componentJson.propagate).to.be.true;
        });
      });
      describe('when file already existing', () => {
        before(() => {
          // Clean from previous test (faster then re-create the entire scope)
          helper.componentJson.deleteIfExist();
          output = helper.command.ejectConf('bar/foo');
        });
        it('should throw error if override not used', () => {
          componentJsonPath = helper.componentJson.composePath('bar');
          const ejectCmd = () => helper.command.ejectConf('bar/foo');
          const error = new ComponentConfigFileAlreadyExistsError(componentJsonPath);
          helper.general.expectToThrow(ejectCmd, error);
        });
        it('should success if override used', () => {
          output = helper.command.ejectConf('bar/foo', { override: '' });
          alignedOutput = GeneralHelper.alignOutput(output);
          expect(alignedOutput).to.have.string(getSuccessEjectMsg('bar/foo', componentJsonPath));
        });
      });
      describe('when there are variant extensions defined', () => {
        let componentJson;
        const config = { key: 'val' };
        before(() => {
          helper.componentJson.deleteIfExist('bar');
          helper.fixtures.copyFixtureExtensions('dummy-extension');
          helper.command.addComponent('dummy-extension');
          helper.extensions.addExtensionToVariant('bar/*', 'default-scope/dummy-extension', config);
          helper.command.ejectConf('bar/foo');
          componentJson = helper.componentJson.read('bar');
        });
        it('should not have extensions from models in component.json', () => {
          expect(componentJson.extensions).to.be.empty;
        });
      });
    });
    describe('eject for tagged component', () => {
      let componentJson;
      const config = { key: 'val' };
      before(() => {
        helper.componentJson.deleteIfExist('bar');
        helper.fixtures.copyFixtureExtensions('dummy-extension');
        helper.command.addComponent('dummy-extension');
        helper.extensions.addExtensionToVariant('bar/*', 'default-scope/dummy-extension', config);
        helper.command.tagAllComponents();
        helper.command.ejectConf('bar/foo');
        componentJson = helper.componentJson.read('bar');
      });
      it('should have extensions from models in component.json', () => {
        expect(componentJson.extensions).to.deep.equal({ 'dummy-extension@0.0.1': config });
      });
    });
  });
  describe('import --conf', () => {});
  describe('creating a capsule', () => {
    // Make sure the component.json is written into capsule
  });
  describe('propagation', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateExtensions(5);
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      const defaultWsExtensions = {
        'my-scope/ext1': { key: 'val-ws-defaults' },
        'my-scope/ext2': { key: 'val-ws-defaults' },
        'my-scope/ext5': { key: 'val-ws-defaults' }
      };
      helper.bitJsonc.addKeyValToWorkspace('extensions', defaultWsExtensions);
      helper.extensions.addExtensionToVariant('bar/foo', 'my-scope/ext2', { key: 'val-variant' });
      helper.extensions.addExtensionToVariant('bar/foo', 'my-scope/ext3', { key: 'val-variant' });
      helper.extensions.addExtensionToVariant('bar/foo', 'my-scope/ext4', { key: 'val-variant' });
      helper.command.ejectConf('bar/foo');
      helper.componentJson.setExtension('my-scope/ext4', { key: 'val-component-json' });
      helper.componentJson.setExtension('my-scope/ext5', { key: 'val-component-json' });
    });
    describe('stop on component.json - component.json propagate false', () => {
      before(() => {
        helper.componentJson.setPropagate(false);
        output = helper.command.showComponentParsed('bar/foo');
      });
      it('should only has extensions defined in component.json', () => {
        expect(output.extensions).to.be.length(2);
        expect(output.extensions).to.deep.include(getExtensionEntry('ext4', { key: 'val-component-json' }));
        expect(output.extensions).to.deep.include(getExtensionEntry('ext5', { key: 'val-component-json' }));
      });
    });
    describe('stop on variant - component.json propagate true and variant propagate false', () => {
      before(() => {
        helper.componentJson.setPropagate(true);
        helper.bitJsonc.addToVariant(helper.scopes.localPath, 'bar/foo', 'propagate', false);
        output = helper.command.showComponentParsed('bar/foo');
      });
      it('should not contain extension from workspace defaults', () => {
        expect(output.extensions).to.be.length(4);
      });
      it('should prefer config from component json when there is conflict', () => {
        expect(output.extensions).to.deep.include(getExtensionEntry('ext4', { key: 'val-component-json' }));
        expect(output.extensions).to.deep.include(getExtensionEntry('ext5', { key: 'val-component-json' }));
      });
      it('should has extensions from the variant', () => {
        expect(output.extensions).to.deep.include(getExtensionEntry('ext2', { key: 'val-variant' }));
        expect(output.extensions).to.deep.include(getExtensionEntry('ext3', { key: 'val-variant' }));
      });
    });
    describe('propagate all the way - component.json propagate true and variant propagate true', () => {
      before(() => {
        helper.componentJson.setPropagate(true);
        helper.bitJsonc.addToVariant(helper.scopes.localPath, 'bar/foo', 'propagate', true);
        output = helper.command.showComponentParsed('bar/foo');
      });
      it('should contain extension from all sources', () => {
        expect(output.extensions).to.be.length(5);
      });
      it('should prefer config from component json when there is conflicts with variant or with workspace defaults', () => {
        expect(output.extensions).to.deep.include(getExtensionEntry('ext4', { key: 'val-component-json' }));
        expect(output.extensions).to.deep.include(getExtensionEntry('ext5', { key: 'val-component-json' }));
      });
      it('should prefer config from variant when there is conflicts with workspace defaults', () => {
        expect(output.extensions).to.deep.include(getExtensionEntry('ext2', { key: 'val-variant' }));
        expect(output.extensions).to.deep.include(getExtensionEntry('ext3', { key: 'val-variant' }));
      });
      it('should has extensions from the workspace defaults', () => {
        expect(output.extensions).to.deep.include(getExtensionEntry('ext1', { key: 'val-ws-defaults' }));
      });
    });
    // TODO: implement once vendor is implemented
    describe.skip('vendor component', () => {
      it('', () => {});
    });
  });
});

function getSuccessEjectMsg(compId: string, componentJsonPath: string): string {
  return `successfully ejected config for component ${compId} in path ${componentJsonPath}`;
}

function getExtensionEntry(extensionId: string, config: any): any {
  return {
    extensionId,
    config,
    data: {},
    artifacts: []
  };
}
