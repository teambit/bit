import { DependencyResolverAspect, SerializedDependency } from '@teambit/dependency-resolver';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { compact, omit, uniq } from 'lodash';
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
};
// type MergeConfigStrategyParams = {
//   id: string;
//   currentConfig: GenericConfig;
//   otherConfig: GenericConfig;
//   baseConfig?: GenericConfigOrRemoved;
// };
type MergeStrategyParams = {
  id: string;
  currentExt: ExtensionDataEntry;
  otherExt: ExtensionDataEntry;
  baseExt?: ExtensionDataEntry;
};
type MergeStrategy = (mergeStrategyParams: MergeStrategyParams) => MergeStrategyResult | undefined;

export class ConfigMerger {
  constructor(
    private compIdStr: string,
    private currentAspects: ExtensionDataList,
    private baseAspects: ExtensionDataList,
    private otherAspects: ExtensionDataList,
    private currentLabel: string,
    private otherLabel: string
  ) {}

  merge(): ConfigMergeResult {
    const handledExtIds: string[] = [];
    const results: MergeStrategyResult[] = this.currentAspects.map((currentExt) => {
      const id = currentExt.stringId;
      handledExtIds.push(id);
      const baseExt = this.baseAspects.findExtension(id, true);
      const otherExt = this.otherAspects.findExtension(id, true);
      if (otherExt) {
        // try to 3-way-merge
        return this.mergePerStrategy({ id, currentExt, otherExt, baseExt });
      }
      // exist in current but not in other
      if (baseExt) {
        // was removed on other
        return this.basicConflictGenerator({ id, currentConfig: currentExt.rawConfig, otherConfig: '-' });
      }
      // exist in current but not in other and base.
      // so it got created on current.
      return { id, config: currentExt };
    });

    return new ConfigMergeResult(this.compIdStr, compact(results));
  }

  private areConfigsEqual(configA: GenericConfigOrRemoved, configB: GenericConfigOrRemoved) {
    return JSON.stringify(configA) === JSON.stringify(configB);
  }

  private mergePerStrategy(mergeStrategyParams: MergeStrategyParams): MergeStrategyResult {
    const { id, currentExt, otherExt, baseExt } = mergeStrategyParams;
    const depResolverResult = this.depResolverStrategy(mergeStrategyParams);
    if (depResolverResult) {
      return depResolverResult;
    }
    const currentConfig = currentExt.rawConfig;
    const otherConfig = otherExt.rawConfig;
    const baseConfig = baseExt?.rawConfig;
    const mergeStrategyConfigParams = { id, currentConfig, otherConfig, baseConfig };
    const basicResult = this.basicConfigMerge(mergeStrategyConfigParams);
    if (basicResult) {
      return basicResult;
    }
    // either no baseConfig, or baseConfig is also different from both: other and local. that's a conflict.
    return this.basicConflictGenerator(mergeStrategyConfigParams);
  }

  private basicConfigMerge(mergeStrategyParams: MergeStrategyParamsWithRemoved): MergeStrategyResult | undefined {
    const { id, currentConfig, otherConfig, baseConfig } = mergeStrategyParams;
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

    return undefined;
  }

  private basicConflictGenerator({
    id,
    currentConfig,
    otherConfig,
  }: MergeStrategyParamsWithRemoved): MergeStrategyResult {
    const formatConfig = (conf: GenericConfigOrRemoved) => {
      const confStr = JSON.stringify(conf, undefined, 2);
      const confStrSplit = confStr.split('\n');
      confStrSplit.shift(); // remove first {
      confStrSplit.pop(); // remove last }
      return confStrSplit.join('\n  ');
    };
    const conflict = `"${id}": {
  ${'<'.repeat(7)} ${this.currentLabel}
    ${formatConfig(currentConfig)}
  =======
    ${formatConfig(otherConfig)}
  ${'>'.repeat(7)} ${this.otherLabel}
    }`;
    return { id, config: { currentConfig, otherConfig }, conflict };
  }

  private depResolverStrategy(params: MergeStrategyParams): MergeStrategyResult | undefined {
    if (params.id !== DependencyResolverAspect.id) return undefined;
    const { id, currentExt, otherExt, baseExt } = params;

    const currentConfig = currentExt.rawConfig;
    const otherConfig = otherExt.rawConfig;
    const baseConfig = baseExt?.rawConfig;
    const mergeStrategyConfigParams = { id, currentConfig, otherConfig, baseConfig };
    const basicMerge = this.basicConfigMerge(mergeStrategyConfigParams);

    // if (!currentConfig.policy && !otherConfig.policy) return undefined; // fallback to basic strategy

    // if there other fields other than "policy" are different, fall back to basic strategy.
    const allKeys = uniq([...Object.keys(currentConfig), ...Object.keys(otherConfig)]);
    const otherKeys = allKeys.filter((key) => key !== 'policy' && key !== '_specific');
    const hasDiffInOtherKeys = otherKeys.some(
      (key) => JSON.stringify(currentConfig[key]) !== JSON.stringify(otherConfig[key])
    );
    // if (hasDiffInOtherKeys) return undefined;

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
    const lifecycleToDepType = {
      runtime: 'dependencies',
      dev: 'devDependencies',
      peer: 'peerDependencies',
    };
    const addSerializedDepToPolicy = (dep: SerializedDependency) => {
      const depType = lifecycleToDepType[dep.lifecycle];
      if (mergedPolicy[depType][dep.id]) {
        return; // there is already config for it.
      }
      mergedPolicy[depType][dep.id] = dep.version;
      isMerged = true;
    };

    const getAutoDeps = (ext: ExtensionDataList): SerializedDependency[] => {
      const data = ext.findCoreExtension(DependencyResolverAspect.id)?.data.dependencies;
      if (!data) return [];
      return data.filter((d) => d.source === 'auto');
    };

    const currentData = getAutoDeps(this.currentAspects);
    const otherData = getAutoDeps(this.otherAspects);
    const baseData = getAutoDeps(this.baseAspects);

    currentData.forEach((currentDep) => {
      const otherDep = otherData.find((d) => d.id === currentDep.id);
      if (!otherDep) {
        return;
      }
      if (currentDep.version === otherDep.version) {
        return;
      }
      const baseDep = baseData.find((d) => d.id === currentDep.id);
      if (baseDep && baseDep.version === otherDep.version) {
        return;
      }
      if (baseDep && baseDep.version === currentDep.version) {
        addSerializedDepToPolicy(otherDep);
        return;
      }
      // either no baseVal, or baseVal is also different from both: other and local. that's a conflict.
      hasConflict = true;
      const depType = lifecycleToDepType[currentDep.lifecycle];
      if (mergedPolicy[depType][currentDep.id]) return; // there is already config for it.
      mergedPolicy[depType][
        currentDep.id
      ] = `${conflictIndicator}${currentDep.id}::${currentDep.version}::${otherDep.version}::`;
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
        return `${'<'.repeat(7)} ${this.currentLabel}
        "${pkgName}": "${currentVal}${comma}"
  =======
        "${pkgName}": "${otherVal}${comma}"
  ${'>'.repeat(7)} ${this.otherLabel}`;
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
}
