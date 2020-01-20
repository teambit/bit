/**
 * provides an option to enable/disable experimental features before releasing them.
 * two ways to enable a feature:
 * 1) from the CLI. prefix your command with CFG_FEATURE_TOGGLE and the features list separated by a comma.
 * 2) from the config. run `bit config set features=<features-list>` and the features list separated by a comma.
 * if the environment variable was provided, it'll skip the config.
 */

import { getSync } from './global-config';
import { CFG_FEATURE_TOGGLE } from '../../../constants';

export const ENV_VAR_FEATURE_TOGGLE = 'BIT_FEATURES';

const LANES_FEATURE = 'lanes';

export function isFeatureEnabled(featureName: string) {
  const enableFeatures = process.env[ENV_VAR_FEATURE_TOGGLE] || getSync(CFG_FEATURE_TOGGLE);
  if (!enableFeatures) return false;
  const featureSplit = enableFeatures.split(',');
  return featureSplit.includes(featureName);
}

export function isLaneEnabled() {
  return isFeatureEnabled(LANES_FEATURE);
}
