import { expect } from 'chai';

import { getAutoTagPending } from './auto-tag';

describe('AutoTag', () => {
  describe('getAutoTagPending', () => {
    it('should return an empty array when there are no components in the scope', async () => {
      const scope = { getComponentsAndVersions: () => Promise.resolve([]) };
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const test = await getAutoTagPending(scope, [], []);
      expect(test).to.be.an('array').and.empty;
    });
  });
});
