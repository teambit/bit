import { expect } from 'chai';
import R from 'ramda';

import ModelComponent from './model-component';

const modelComponentFixture = {
  name: 'bar/foo',
  scope: 'remote-scope',
  versions: {
    '0.0.1': '125a37bdb17220bdc1406a9a28a3dde4eec91225',
  },
  lang: 'javascript',
  deprecated: false,
  bindingPrefix: '@bit',
  remotes: [
    {
      url: 'file:///tmp/remote-scope',
      name: 'remote-scope',
      date: '1572532837438',
    },
  ],
  state: {
    versions: {
      '0.0.1': {
        local: true,
      },
    },
  },
};

const getModelComponentFixture = (): typeof modelComponentFixture => {
  return R.clone(modelComponentFixture);
};

const getModelComponent = (obj: object): ModelComponent => {
  return ModelComponent.parse(JSON.stringify(obj));
};

describe('ModelComponent', () => {
  describe('validate', () => {
    let validateFunc: Function;
    describe('duplicate hashes', () => {
      let modelComponent: ModelComponent;
      before(() => {
        const fixture = getModelComponentFixture();
        fixture.versions['0.0.2'] = fixture.versions['0.0.1'];
        modelComponent = getModelComponent(fixture);
        validateFunc = () => modelComponent.validate();
      });
      it('should throw an error', () => {
        expect(validateFunc).to.throw('the following hash(es) are duplicated');
      });
    });
  });
});
