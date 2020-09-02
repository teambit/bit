import { expect } from 'chai';

import buildQuery from '../search/query-builder';

describe('query-builder', () => {
  describe('buildQuery', () => {
    const queryToObject = (query) => query.reduce((acc, val) => Object.assign(acc, val.AND), {});

    it('should produce a clause for the name field as is', () => {
      const query = queryToObject(buildQuery('is-string'));
      expect(query.name).to.eql(['is-string']);
    });
    it('should produce a clause for the name field tokenized', () => {
      const query = queryToObject(buildQuery('is-string'));
      expect(query.tokenizedName).to.eql(['is', 'string']);
    });
    it('should produce clauses for the stem version of the search query', () => {
      const query = queryToObject(buildQuery('casting int'));
      expect(query.stemmedName).to.eql(['cast', 'int']);
      expect(query.stemmedMinDescription).to.eql(['cast', 'int']);
    });
  });
});
