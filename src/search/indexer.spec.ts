import { expect } from 'chai';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import indexer from '../search/indexer';

describe('Indexer', () => {
  describe('tokenizeStr', () => {
    it('should split by camelCase', () => {
      expect(indexer.tokenizeStr('camelCase')).to.equal('camel case');
    });
    it('should split by hyphen', () => {
      expect(indexer.tokenizeStr('foo-bar')).to.equal('foo bar');
    });
    it('should split by underscore', () => {
      expect(indexer.tokenizeStr('foo_bar')).to.equal('foo bar');
    });
    it('should lowercase', () => {
      expect(indexer.tokenizeStr('Foo')).to.equal('foo');
    });
    it('should tokenize various combinations', () => {
      expect(indexer.tokenizeStr('CamelCase-with-hyphen_and_underscore')).to.equal(
        'camel case with hyphen and underscore'
      );
    });
  });
});
