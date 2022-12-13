import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { omit, uniq } from 'lodash';
import { ConfigMergeResult } from './config-merge-result';

type GenericConfig = Record<string, any>;
type GenericConfigOrRemoved = Record<string, any> | '-';

export type MergeStrategyResult = {
  id: string;
  config: GenericConfigOrRemoved | null;
  conflict?: string;
  isMerged?: boolean;
};
type MergeStrategyParamsWithRemoved = {
  id: string;
  currentConfig: GenericConfigOrRemoved;
  otherConfig: GenericConfigOrRemoved;
  baseConfig?: GenericConfigOrRemoved;
  currentLabel: string;
  otherLabel: string;
};
type MergeStrategyParams = {
  id: string;
  currentConfig: GenericConfig;
  otherConfig: GenericConfig;
  baseConfig?: GenericConfigOrRemoved;
  currentLabel: string;
  otherLabel: string;
};
type MergeStrategy = (mergeStrategyParams: MergeStrategyParams) => MergeStrategyResult | undefined;

export class ConfigMerger {
  constructor(
    private currentAspects: ExtensionDataList,
    private baseAspects: ExtensionDataList,
    private otherAspects: ExtensionDataList,
    private currentLabel: string,
    private otherLabel: string
  ) {}

  merge(): ConfigMergeResult {
    const handledExtIds: string[] = [];
    const results: MergeStrategyResult[] = this.currentAspects.map((extInCurrent) => {
      const id = extInCurrent.stringId;
      handledExtIds.push(id);
      const extInBase = this.baseAspects.findExtension(id, true);
      const extInOther = this.otherAspects.findExtension(id, true);
      if (extInOther) {
        // try to 3-way-merge
        return this.mergePerStrategy(id, extInCurrent.rawConfig, extInOther.rawConfig, extInBase?.rawConfig);
      }
      // exist in current but not in other
      if (extInBase) {
        // was removed on other (?)
        // todo: check if it possible to get here. probably when the other removes an aspect, it gets the value "-".
        // which is handled before.
        return this.mergePerStrategy(id, extInCurrent.rawConfig, '-', extInBase.rawConfig);
      }
      // exist in current but not in other and base.
      // so it got created on current.
      return { id, config: extInCurrent };
    });

    return new ConfigMergeResult(results);
  }

  private areConfigsEqual(configA: GenericConfigOrRemoved, configB: GenericConfigOrRemoved) {
    return JSON.stringify(configA) === JSON.stringify(configB);
  }

  private mergePerStrategy(
    id: string,
    currentConfig: GenericConfigOrRemoved,
    otherConfig: GenericConfigOrRemoved,
    baseConfig?: GenericConfigOrRemoved
  ): MergeStrategyResult {
    if (this.areConfigsEqual(currentConfig, otherConfig)) {
      return { id, config: currentConfig };
    }
    if (baseConfig && this.areConfigsEqual(baseConfig, otherConfig)) {
      // was changed on current
      return { id, config: currentConfig };
    }
    if (baseConfig && this.areConfigsEqual(baseConfig, currentConfig)) {
      // was changed on other
      return { id, config: otherConfig, isMerged: true };
    }
    // either no baseConfig, or baseConfig is also different from both: other and local. that's a conflict.
    const mergeStrategyParams: MergeStrategyParamsWithRemoved = {
      id,
      currentConfig,
      otherConfig,
      baseConfig,
      currentLabel: this.currentLabel,
      otherLabel: this.otherLabel,
    };
    if (currentConfig === '-' || otherConfig === '-') {
      // one of the configs is removed. no need to run the strategies. the basic is enough.
      return basicStrategy(mergeStrategyParams);
    }
    const strategies: MergeStrategy[] = [depResolverStrategy];
    for (const strategy of strategies) {
      const result = strategy(mergeStrategyParams as MergeStrategyParams);
      if (result) {
        return result;
      }
    }
    return basicStrategy(mergeStrategyParams);
  }
}

function basicStrategy({
  id,
  currentConfig,
  otherConfig,
  currentLabel,
  otherLabel,
}: MergeStrategyParamsWithRemoved): MergeStrategyResult {
  const formatConfig = (conf: GenericConfigOrRemoved) => {
    const confStr = JSON.stringify(conf, undefined, 2);
    const confStrSplit = confStr.split('\n');
    confStrSplit.shift(); // remove first {
    confStrSplit.pop(); // remove last }
    return confStrSplit.join('\n  ');
  };
  const conflict = `"${id}": {
${'<'.repeat(7)} ${currentLabel}
  ${formatConfig(currentConfig)}
=======
  ${formatConfig(otherConfig)}
${'>'.repeat(7)} ${otherLabel}
  }`;
  return { id, config: { currentConfig, otherConfig }, conflict };
}

function depResolverStrategy(params: MergeStrategyParams): MergeStrategyResult | undefined {
  if (params.id !== DependencyResolverAspect.id) return undefined;
  const { currentConfig, otherConfig, baseConfig } = params;
  if (!currentConfig.policy && !otherConfig.policy) return undefined; // fallback to basic strategy

  // if one of them specific and the other one, take the one that is specific.
  if (currentConfig.__specific && !otherConfig.__specific) {
    return { id: params.id, config: currentConfig };
  }
  if (!currentConfig.__specific && otherConfig.__specific) {
    return { id: params.id, config: otherConfig, isMerged: true };
  }

  // if there other fields other than "policy" are different, fall back to basic strategy.
  const allKeys = uniq([...Object.keys(currentConfig), ...Object.keys(otherConfig)]);
  const otherKeys = allKeys.filter((key) => key !== 'policy' && key !== '_specific');
  const hasDiffInOtherKeys = otherKeys.some(
    (key) => JSON.stringify(currentConfig[key]) !== JSON.stringify(otherConfig[key])
  );
  if (hasDiffInOtherKeys) return undefined;

  const mergedPolicy = {
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
  };
  let isMerged = false;
  let hasConflict = false;
  const conflictIndicator = 'CONFLICT::';
  ['dependencies', 'devDependencies', 'peerDependencies'].forEach((depType) => {
    const currentPolicy = currentConfig.policy?.[depType];
    const otherPolicy = otherConfig.policy?.[depType];
    const allPolicyKeys = uniq(Object.keys(currentPolicy || {}).concat(Object.keys(otherPolicy || {})));
    if (!allPolicyKeys.length) return;

    allPolicyKeys.forEach((pkgName) => {
      const currentVal = currentPolicy?.[pkgName];
      const otherVal = otherPolicy?.[pkgName];
      const baseVal = baseConfig !== '-' && baseConfig?.policy?.[depType]?.[pkgName];
      if (currentVal === otherVal) {
        mergedPolicy[depType][pkgName] = currentVal;
        return;
      }
      if (baseVal === otherVal) {
        mergedPolicy[depType][pkgName] = currentVal;
        return;
      }
      if (baseVal === currentVal) {
        mergedPolicy[depType][pkgName] = otherVal;
        isMerged = true;
        return;
      }
      // either no baseVal, or baseVal is also different from both: other and local. that's a conflict.
      hasConflict = true;
      mergedPolicy[depType][pkgName] = `${conflictIndicator}${pkgName}::${currentVal}::${otherVal}::`;
    });
  });
  const otherKeysFromCurrent = omit(currentConfig, ['policy']);
  const config = { ...otherKeysFromCurrent, policy: mergedPolicy };
  if (hasConflict) {
    const mergedConfigSplit = JSON.stringify(config, undefined, 2).split('\n');
    const conflictLines = mergedConfigSplit.map((line) => {
      if (!line.includes(conflictIndicator)) return line;
      const [, pkgName, currentVal, otherVal, endLine] = line.split('::');
      const shouldEndWithComma = endLine.includes(',');
      const comma = shouldEndWithComma ? ',' : '';
      return `${'<'.repeat(7)} ${params.currentLabel}
      "${pkgName}": "${currentVal}${comma}"
=======
      "${pkgName}": "${otherVal}${comma}"
${'>'.repeat(7)} ${params.otherLabel}`;
    });
    // replace the first line with line with the id
    conflictLines.shift();
    conflictLines.unshift(`  "${params.id}": {`);
    // the first conflict indicator is indented, remove the indentation. join all lines with indentation of 2.
    const conflict = conflictLines.join('\n  ').replace(`  ${'<'.repeat(7)}`, '<'.repeat(7));
    return { id: params.id, config, conflict, isMerged };
  }
  return { id: params.id, config, isMerged };
}
