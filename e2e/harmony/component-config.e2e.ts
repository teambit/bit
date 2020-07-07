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
    });
    describe('eject for tagged component', () => {
      it('', () => {});
    });
  });
  describe('propagation', () => {
    describe('stop on component.json', () => {
      it('', () => {});
    });
    describe('stop on variant', () => {
      it('', () => {});
    });
    describe('propagate all the way', () => {
      it('', () => {});
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
