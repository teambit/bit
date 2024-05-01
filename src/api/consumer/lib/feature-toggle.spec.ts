import { expect } from 'chai';

import { addFeature, ENV_VAR_FEATURE_TOGGLE, isFeatureEnabled } from './feature-toggle';

describe('featureToggle', () => {
  after(() => {
    process.env[ENV_VAR_FEATURE_TOGGLE] = '';
  });
  describe('isFeatureEnabled', () => {
    it('should work with multiple features', () => {
      process.env[ENV_VAR_FEATURE_TOGGLE] = 'feature1, feature2';
      expect(isFeatureEnabled('feature1')).to.be.true;
      expect(isFeatureEnabled('feature2')).to.be.true;
      expect(isFeatureEnabled('feature3')).to.be.false;
    });
  });
  describe('addFeature', () => {
    it('should add feature', () => {
      addFeature('add1');
      expect(isFeatureEnabled('add1')).to.be.true;
    });
    it('should add feature to existing features', () => {
      process.env[ENV_VAR_FEATURE_TOGGLE] = 'feature1, feature2';
      addFeature('add1');
      expect(isFeatureEnabled('add1')).to.be.true;
      expect(isFeatureEnabled('feature1')).to.be.true;
      expect(isFeatureEnabled('feature2')).to.be.true;
      expect(isFeatureEnabled('feature3')).to.be.false;
    });
  });
});
