import { expect } from 'chai';
import { ExtensionDataList } from './extension-data';

describe('ExtensionDataList', () => {
  describe('merge lists', () => {
    let mergedAsObject;
    before(() => {
      const list1 = ExtensionDataList.fromConfigObject({
        'my-scope/ext1': {
          conf1: 'val1',
          conf3: 'val3'
        },
        'my-scope/ext2': {
          conf1: 'val1'
        }
      });
      const list2 = ExtensionDataList.fromConfigObject({
        'my-scope/ext1': {
          conf1: 'val2',
          conf2: 'val2'
        },
        'my-scope/ext3': {
          conf1: 'val1'
        }
      });
      const list3 = ExtensionDataList.fromConfigObject({
        'my-scope/ext1': {
          conf1: 'val2',
          conf4: 'val4'
        },
        'my-scope/ext4': {
          conf1: 'val1'
        }
      });
      const merged = ExtensionDataList.mergeConfigs([list1, list2, list3]);
      mergedAsObject = merged.toConfigObject();
    });
    it('should take the last occurrence of an extension', () => {
      expect(mergedAsObject['my-scope/ext1']).to.deep.equal({
        conf1: 'val2',
        conf4: 'val4'
      });
    });
    it('should take extensions from all lists', () => {
      expect(mergedAsObject['my-scope/ext2']).to.deep.equal({
        conf1: 'val1'
      });
      expect(mergedAsObject['my-scope/ext3']).to.deep.equal({
        conf1: 'val1'
      });
      expect(mergedAsObject['my-scope/ext4']).to.deep.equal({
        conf1: 'val1'
      });
    });
  });
});
