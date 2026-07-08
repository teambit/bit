import { expect } from 'chai';

import { addFeature, ENV_VAR_FEATURE_TOGGLE, isFeatureEnabled, reloadFeatureToggle } from './feature-toggle';

describe('featureToggle', () => {
  let originalEnvValue: string | undefined;
  before(() => {
    originalEnvValue = process.env[ENV_VAR_FEATURE_TOGGLE];
  });
  // the FeatureToggle singleton caches the features on first use. when mocha runs multiple
  // spec files in the same process, an earlier spec may have already populated the cache,
  // so reset it before each test to make the env-var changes below take effect.
  beforeEach(() => {
    delete process.env[ENV_VAR_FEATURE_TOGGLE];
    reloadFeatureToggle();
  });
  // restore the pre-suite env-var value so later specs in the same process are unaffected.
  after(() => {
    if (originalEnvValue === undefined) delete process.env[ENV_VAR_FEATURE_TOGGLE];
    else process.env[ENV_VAR_FEATURE_TOGGLE] = originalEnvValue;
    reloadFeatureToggle();
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
