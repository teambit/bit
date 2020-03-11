/**
 * provides an option to enable/disable experimental features before releasing them.
 * two ways to enable a feature:
 * 1) from the CLI. prefix your command with CFG_FEATURE_TOGGLE and the features list separated by a comma.
 * 2) from the config. run `bit config set features=<features-list>` and the features list separated by a comma.
 * if the environment variable was provided, it'll skip the config.
 * the results are cached so no penalty calling it multiple times in the same process.
 *
 * for the e2e-tests, there is a mechanism built around it, see the class docs of CommandHelper class.
 */

import { getSync } from './global-config';
import { CFG_FEATURE_TOGGLE } from '../../../constants';

export const ENV_VAR_FEATURE_TOGGLE = 'BIT_FEATURES';

type IsFeatureEnabled = { (featureName: string): boolean; cache?: { [featureName: string]: boolean } };

export const isFeatureEnabled: IsFeatureEnabled = (featureName: string): boolean => {
  if (typeof isFeatureEnabled.cache === 'undefined' || !isFeatureEnabled[featureName]) {
    isFeatureEnabled.cache = isFeatureEnabled.cache || {};
    const enableFeatures = process.env[ENV_VAR_FEATURE_TOGGLE] || getSync(CFG_FEATURE_TOGGLE);
    if (enableFeatures) {
      const featureSplit = enableFeatures.split(',');
      isFeatureEnabled.cache[featureName] = featureSplit.includes(featureName);
    } else {
      isFeatureEnabled.cache[featureName] = false;
    }
  }
  return isFeatureEnabled.cache[featureName];
};
