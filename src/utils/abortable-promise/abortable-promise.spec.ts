import { expect } from 'chai';

import AbortablePromise from './abortable-promise';
import { MissingAbortFn } from './exceptions';

describe('AbortablePromise', () => {
  describe('abort()', () => {
    it('abort a native promise by executing given abort fn', (done) => {
      function abortFn() {
        expect(true).to.eq(true);
        done();
      }

      const promise = new AbortablePromise(() => {}, abortFn);
      promise.abort();
    });

    it('should throw a MissingAbortFn exception if abort was called when abort fn was not provided', () => {
      const promise = new AbortablePromise(() => {});
      expect(() => promise.abort()).to.throw(MissingAbortFn);
    });
  });
});
