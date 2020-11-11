import { expect } from 'chai';
import { DevFiles } from './dev-files';

describe('DevFiles', () => {
  let devFiles = new DevFiles({});

  beforeEach(() => {
    devFiles = new DevFiles({
      'teambit.defender/tester': ['button.spec.tsx'],
      'teambit.compositions/compositions': ['button.composition.tsx'],
      'teambit.docs/docs': ['button.docs.ts'],
    });
  });
  describe('get()', () => {
    it('get all dev files of the docs aspect', () => {
      expect(devFiles.get('teambit.docs/docs')).to.deep.eq(['button.docs.ts']);
    });

    it('should get undefined as there are no files for aspect id', () => {
      expect(devFiles.get('teambit.compositions')).to.deep.eq([]);
    });
  });

  describe('list()', () => {
    it('should list all dev files', () => {
      const allFiles = devFiles.list();
      expect(allFiles).to.include.deep.eq(['button.spec.tsx', 'button.composition.tsx', 'button.docs.ts']);
    });
  });
});
