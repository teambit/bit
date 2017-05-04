import { expect } from 'chai';
import { Environment } from '../../src/environment';

describe('Environment', () => {
  describe('constructor', () => {
    it('should generate a unique path for every instance', () => {
      const environment1 = new Environment();
      const environment2 = new Environment();
      expect(environment1.path).not.to.be.equal(environment2.path);
    });
  });
});
