import { expect } from 'chai';

import { getAutoTagPending } from './auto-tag';

describe('AutoTag', () => {
  describe('getAutoTagPending', () => {
    it('should return an empty array when there are no components in the workspace', async () => {
      const consumer = {
        bitMap: { getAuthoredAndImportedBitIds: () => [] },
        loadComponents: () => Promise.resolve({ components: [] }),
      };
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const test = await getAutoTagPending(consumer, []);
      expect(test).to.be.an('array').and.empty;
    });
  });
});
