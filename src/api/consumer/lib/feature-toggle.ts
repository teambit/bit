/**
 * provides an option to enable/disable experimental features before releasing them.
 * two ways to enable a feature:
 * 1) from the CLI. prefix your command with BIT_FEATURES and the features list separated by a comma.
 * 2) from the config. run `bit config set features=<features-list>` and the features list separated by a comma.
 * if the environment variable was provided, it'll skip the config.
 * the results are cached so no penalty calling it multiple times in the same process.
 *
 * to use it in the code, simply call `isFeatureEnabled('your-feature')`
 *
 * for the e2e-tests, there is a mechanism built around it, to enable/disable features per file or
 * per command. see the docs of CommandHelper class for more info.
 */

import { CFG_FEATURE_TOGGLE } from '../../../constants';
import { getSync } from './global-config';

export const ENV_VAR_FEATURE_TOGGLE = 'BIT_FEATURES';

class FeatureToggle {
  private features: string[] | null | undefined;
  private areFeaturesPopulated() {
    return this.features !== undefined;
  }
  private setFeatures() {
    if (this.areFeaturesPopulated()) return;
    const enabledFeatures = process.env[ENV_VAR_FEATURE_TOGGLE] || getSync(CFG_FEATURE_TOGGLE);
    this.features = enabledFeatures ? enabledFeatures.split(',').map((f) => f.trim()) : null;
  }
  public isFeatureEnabled(featureName: string): boolean {
    this.setFeatures();
    return this.features ? this.features.includes(featureName) : false;
  }
  public addFeature(featureName: string) {
    this.setFeatures();
    if (this.features) this.features.push(featureName);
    else this.features = [featureName];
  }
}

const featureToggle = new FeatureToggle();

export function isFeatureEnabled(featureName: string): boolean {
  return featureToggle.isFeatureEnabled(featureName);
}

export function addFeature(featureName: string) {
  featureToggle.addFeature(featureName);
}

export const LEGACY_SHARED_DIR_FEATURE = 'legacy-shared-dir';

export const HARMONY_FEATURE = 'harmony';

export const NO_FS_CACHE_FEATURE = 'no-fs-cache';

export const BUILD_ON_CI = 'build-on-ci';

export const EXPORT_CENTRAL = 'export-central';

export function isHarmonyEnabled() {
  return isFeatureEnabled(HARMONY_FEATURE);
}
