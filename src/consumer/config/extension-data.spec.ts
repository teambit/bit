import { expect } from 'chai';

import { BitId } from '../../bit-id';
import { ExtensionDataEntry, ExtensionDataList } from './extension-data';

describe('ExtensionDataList', () => {
  describe('merge lists', () => {
    let mergedAsObject;
    before(() => {
      const list1 = ExtensionDataList.fromConfigObject({
        'my-scope/ext1': {
          conf1: 'val2',
          conf4: 'val4',
        },
        'my-scope/ext4': {
          conf1: 'val1',
        },
        'my-scope/ext5': '-',
        'my-scope/ext6': {
          conf1: 'val1',
        },
      });
      const list2 = ExtensionDataList.fromConfigObject({
        'my-scope/ext1': {
          conf1: 'val2',
          conf2: 'val2',
        },
        'my-scope/ext3': {
          conf1: 'val1',
        },
        'my-scope/ext5': {
          conf1: 'val1',
        },
        'my-scope/ext6': '-',
      });
      const list3 = ExtensionDataList.fromConfigObject({
        'my-scope/ext1': {
          conf1: 'val1',
          conf3: 'val3',
        },
        'my-scope/ext2': {
          conf1: 'val1',
        },
      });

      const merged = ExtensionDataList.mergeConfigs([list1, list2, list3]);
      mergedAsObject = merged.toConfigObject();
    });
    it('should take the former occurrence of an extension', () => {
      expect(mergedAsObject['my-scope/ext1']).to.deep.equal({
        conf1: 'val2',
        conf4: 'val4',
      });
    });
    it('should handle merge for special remove sign', () => {
      expect(mergedAsObject['my-scope/ext5']).to.deep.equal('-');
      expect(mergedAsObject['my-scope/ext6']).to.deep.equal({
        conf1: 'val1',
      });
    });
    it('should take extensions from all lists', () => {
      expect(mergedAsObject['my-scope/ext2']).to.deep.equal({
        conf1: 'val1',
      });
      expect(mergedAsObject['my-scope/ext3']).to.deep.equal({
        conf1: 'val1',
      });
      expect(mergedAsObject['my-scope/ext4']).to.deep.equal({
        conf1: 'val1',
      });
    });
  });
  describe('sort lists', () => {
    let sorted;
    before(() => {
      const list = ExtensionDataList.fromConfigObject({
        'my-scope/ext3': {
          conf1: 'val1',
        },
        'my-scope/ext1': {
          conf1: 'val2',
          conf4: 'val4',
        },
        'my-scope/ext4': {
          conf1: 'val1',
        },
      });

      sorted = list.sortById();
    });
    it('should sort the list by ids', () => {
      expect(sorted[0].stringId).to.equal('my-scope/ext1');
      expect(sorted[1].stringId).to.equal('my-scope/ext3');
      expect(sorted[2].stringId).to.equal('my-scope/ext4');
    });
  });
  describe('filter removed', () => {
    let filtered;
    let filteredAsObject;
    before(() => {
      const list = ExtensionDataList.fromConfigObject({
        'my-scope/ext3': {
          conf1: 'val1',
        },
        'my-scope/ext1': {
          conf1: 'val2',
          conf4: 'val4',
        },
        'my-scope/ext4': '-',
      });

      filtered = list.filterRemovedExtensions();
      filteredAsObject = filtered.toConfigObject();
    });
    it('should sort the list by ids', () => {
      expect(filtered.length).to.equal(2);
      expect(filteredAsObject).to.not.have.property('my-scope/ext4');
    });
  });
  describe('to config array', () => {
    let configArr;
    before(() => {
      const configEntry = new ExtensionDataEntry(undefined, BitId.parse('my-scope/ext1', true), undefined, {
        conf1: 'val1',
      });
      const dataEntry = new ExtensionDataEntry(
        undefined,
        BitId.parse('my-scope/ext2', true),
        undefined,
        {},
        { data1: 'val1' }
      );
      const dataConfigEntry = new ExtensionDataEntry(
        undefined,
        BitId.parse('my-scope/ext3', true),
        undefined,
        { conf3: 'val3' },
        { data3: 'val3' }
      );
      const list = ExtensionDataList.fromArray([configEntry, dataEntry, dataConfigEntry]);
      configArr = list.toConfigArray();
    });
    it('should not have entries with data only', () => {
      expect(configArr.length).to.equal(2);
    });
    it('should have entries with config only', () => {
      expect(configArr[0].id.toString()).to.equal('my-scope/ext1');
      expect(configArr[0].config).to.deep.equal({ conf1: 'val1' });
    });
    it('should have entries with data and config but without the data', () => {
      expect(configArr[1].id.toString()).to.equal('my-scope/ext3');
      expect(configArr[1].config).to.deep.equal({ conf3: 'val3' });
      expect(configArr[1].data).to.be.undefined;
    });
  });
});
