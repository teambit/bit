import { expect } from 'chai';

import ModelComponent from './model-component';
import { cloneDeep } from 'lodash';
import { Ref } from '../objects';

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
  return cloneDeep(modelComponentFixture);
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
  describe('versions lookup', () => {
    const tagHash = '125a37bdb17220bdc1406a9a28a3dde4eec91225';
    const orphanedHash = '225a37bdb17220bdc1406a9a28a3dde4eec91225';
    let modelComponent: ModelComponent;
    before(() => {
      modelComponent = getModelComponent(getModelComponentFixture());
      modelComponent.setOrphanedVersion('0.0.3', Ref.from(orphanedHash));
    });
    it('should find the ref of a tag and of an orphaned tag', () => {
      expect(modelComponent.getRef('0.0.1')?.toString()).to.equal(tagHash);
      expect(modelComponent.getRef('0.0.3')?.toString()).to.equal(orphanedHash);
    });
    it('should find the tag of a ref and of an orphaned ref', () => {
      expect(modelComponent.getTagOfRefIfExists(Ref.from(tagHash))).to.equal('0.0.1');
      expect(modelComponent.getTagOfRefIfExists(Ref.from(orphanedHash))).to.equal('0.0.3');
      expect(
        modelComponent.switchHashesWithTagsIfExist([Ref.from(orphanedHash), Ref.from('a'.repeat(40))])
      ).to.deep.equal(['0.0.3', 'a'.repeat(40)]);
    });
    it('should find the newest tag of a ref and not return a remembered tag after the versions changed', () => {
      const component = getModelComponent(getModelComponentFixture());
      const ref = Ref.from(tagHash);
      component.setVersion('0.0.2', Ref.from('b'.repeat(40)));
      expect(component.getTagOfRefIfExists(ref)).to.equal('0.0.1');
      delete component.versions['0.0.1'];
      expect(component.getTagOfRefIfExists(ref)).to.be.undefined;
      component.setVersion('0.0.5', ref);
      expect(component.getTagOfRefIfExists(ref)).to.equal('0.0.5');
    });
  });
});
