import { ComponentID } from '@teambit/component-id';
import { DependencyResolverAspect, SerializedDependency } from '@teambit/dependency-resolver';
import { EnvsAspect } from '@teambit/envs';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { compact, omit, uniq, uniqBy } from 'lodash';
import { ConfigMergeResult } from './config-merge-result';

type GenericConfigOrRemoved = Record<string, any> | '-';

type EnvData = { id: string; version?: string; config?: GenericConfigOrRemoved };

export type MergeStrategyResult = {
  id: string;
  mergedConfig?: GenericConfigOrRemoved;
  conflict?: string;
};
type MergeStrategyParamsWithRemoved = {
  id: string;
  currentConfig: GenericConfigOrRemoved;
  otherConfig: GenericConfigOrRemoved;
  baseConfig?: GenericConfigOrRemoved;
};
type MergeStrategyParams = {
  id: string;
  currentExt: ExtensionDataEntry;
  otherExt: ExtensionDataEntry;
  baseExt?: ExtensionDataEntry;
};

/**
 * perform 3-way merge of component configuration (aspects).
 * normally this is needed when merging one lane into another. the component may have different aspects config in each lane.
 * the baseAspects are the aspects of the component in the diversion point (the common ancestor of the two lanes).
 * the currentAspects are the aspects of the component in the current lane.
 * the otherAspects are the aspects of the component in the other lane. this is the lane we merge into the current lane.
 *
 * the basic merging strategy is a simple comparison between the aspect-configs, if they're different, we have a conflict.
 * we have two special cases:
 *
 * 1. dependency-resolver: we do a deeper check for the policy, we compare each dependency separately. also, we take
 * into account not only the config, but also the data. this is needed because some dependencies are automatically
 * added by Bit (from the import statements in the code) and they're not in the config. the final config has the deps
 * from both sources, the config and the data. The way we know to differentiate between them is by the "force" prop.
 * the config has always force: true.
 *
 * 2. envs: if we don't treat it specially, the user will need to make the change not only in the envs aspect, but also
 * in the deps-resolver (because the env is added as a devDependency) and also in the aspect itself (because
 * teambit.envs/env has only the id and not the version). to make it simpler, we ignore the envs in the deps-resolver
 * we ignore the individual aspect that is the env itself. we only show teambit.envs/env and we put the env id and
 * version. later, when the component is loaded, we split the id and the version and put them in the correct places.
 * see workspace.componentExtension / adjustEnvsOnConfigMerge for more details.
 */
export class ConfigMerger {
  private currentEnv: EnvData;
  private otherEnv: EnvData;
  private baseEnv?: EnvData;
  private handledExtIds: string[] = [];
  constructor(
    private compIdStr: string,
    private workspaceIds: ComponentID[],
    private currentAspects: ExtensionDataList,
    private baseAspects: ExtensionDataList,
    private otherAspects: ExtensionDataList,
    private currentLabel: string,
    private otherLabel: string
  ) {}

  merge(): ConfigMergeResult {
    this.populateEnvs();
    const results = this.currentAspects.map((currentExt) => {
      const id = currentExt.stringId;
      if (this.handledExtIds.includes(id)) return null;
      this.handledExtIds.push(id);
      const baseExt = this.baseAspects.findExtension(id, true);
      const otherExt = this.otherAspects.findExtension(id, true);
      if (otherExt) {
        // try to 3-way-merge
        return this.mergePerStrategy({ id, currentExt, otherExt, baseExt });
      }
      // exist in current but not in other
      if (baseExt) {
        // was removed on other
        return this.basicConflictGenerator({ id, currentConfig: this.getConfig(currentExt), otherConfig: '-' });
      }
      // exist in current but not in other and base, so it got created on current. nothing to do.
      return null;
    });
    const otherAspectsNotHandledResults = this.otherAspects.map((otherExt) => {
      const id = otherExt.stringId;
      if (this.handledExtIds.includes(id)) return null;
      this.handledExtIds.push(id);
      const baseExt = this.baseAspects.findExtension(id, true);
      if (baseExt) {
        // was removed on current
        return this.basicConflictGenerator({ id, currentConfig: '-', otherConfig: this.getConfig(otherExt) });
      }
      // exist in other but not in current and base, so it got created on other.
      return { id, mergedConfig: this.getConfig(otherExt) };
    });
    const envResult = this.envStrategy();
    return new ConfigMergeResult(this.compIdStr, compact([...results, ...otherAspectsNotHandledResults, envResult]));
  }

  private populateEnvs() {
    // populate ids
    const getEnvId = (ext: ExtensionDataList) => {
      const envsAspect = ext.findCoreExtension(EnvsAspect.id);
      if (!envsAspect) throw new Error(`unable to find ${EnvsAspect.id} aspect for ${this.compIdStr}`);
      const env = envsAspect.config.env || envsAspect.data.id;
      if (!env)
        throw new Error(`unable to find env for ${this.compIdStr}, the config and data of ${EnvsAspect.id} are empty}`);
      return env;
    };
    const currentEnv = getEnvId(this.currentAspects);
    this.currentEnv = { id: currentEnv };
    const otherEnv = getEnvId(this.otherAspects);
    this.otherEnv = { id: otherEnv };
    const baseEnv = this.baseAspects ? getEnvId(this.baseAspects) : undefined;
    if (baseEnv) this.baseEnv = { id: baseEnv };

    // populate version
    const currentEnvAspect = this.currentAspects.findExtension(currentEnv, true);
    if (currentEnvAspect) {
      this.handledExtIds.push(currentEnvAspect.stringId);
      this.currentEnv.version = currentEnvAspect.extensionId?.version;
      this.currentEnv.config = currentEnvAspect.rawConfig;
    }
    const otherEnvAspect = this.otherAspects.findExtension(otherEnv, true);
    if (otherEnvAspect) {
      this.handledExtIds.push(otherEnvAspect.stringId);
      this.otherEnv.version = otherEnvAspect.extensionId?.version;
      this.otherEnv.config = otherEnvAspect.rawConfig;
    }
    if (this.baseEnv) {
      const baseEnvAspect = this.baseAspects.findExtension(baseEnv, true);
      if (baseEnvAspect) {
        this.baseEnv.version = baseEnvAspect.extensionId?.version;
        this.baseEnv.config = baseEnvAspect.rawConfig;
      }
    }
  }

  private envStrategy(): MergeStrategyResult | null {
    const mergeStrategyParams: MergeStrategyParamsWithRemoved = {
      id: EnvsAspect.id,
      currentConfig: {
        env: this.currentEnv.version ? `${this.currentEnv.id}@${this.currentEnv.version}` : this.currentEnv.id,
      },
      otherConfig: { env: this.otherEnv.version ? `${this.otherEnv.id}@${this.otherEnv.version}` : this.otherEnv.id },
    };
    if (this.baseEnv) {
      mergeStrategyParams.baseConfig = {
        env: this.baseEnv?.version ? `${this.baseEnv.id}@${this.baseEnv.version}` : this.baseEnv?.id,
      };
    }
    if (this.currentEnv.id === this.otherEnv.id && this.currentEnv.version === this.otherEnv.version) {
      return null;
    }
    if (this.isIdInWorkspace(this.currentEnv.id)) {
      // the env currently used is part of the workspace, that's what the user needs. don't try to resolve anything.
      return null;
    }
    return this.basicConfigMerge(mergeStrategyParams);
  }

  private areConfigsEqual(configA: GenericConfigOrRemoved, configB: GenericConfigOrRemoved) {
    return JSON.stringify(configA) === JSON.stringify(configB);
  }

  private mergePerStrategy(mergeStrategyParams: MergeStrategyParams): MergeStrategyResult | null {
    const { id, currentExt, otherExt, baseExt } = mergeStrategyParams;
    const depResolverResult = this.depResolverStrategy(mergeStrategyParams);
    if (depResolverResult) {
      return depResolverResult;
    }
    const currentConfig = this.getConfig(currentExt);
    const otherConfig = this.getConfig(otherExt);
    const baseConfig = baseExt ? this.getConfig(baseExt) : undefined;

    return this.basicConfigMerge({ id, currentConfig, otherConfig, baseConfig });
  }

  private basicConfigMerge(mergeStrategyParams: MergeStrategyParamsWithRemoved) {
    const { id, currentConfig, otherConfig, baseConfig } = mergeStrategyParams;
    if (this.areConfigsEqual(currentConfig, otherConfig)) {
      return null;
    }
    if (baseConfig && this.areConfigsEqual(baseConfig, otherConfig)) {
      // was changed on current
      return null;
    }
    if (baseConfig && this.areConfigsEqual(baseConfig, currentConfig)) {
      // was changed on other
      return { id, mergedConfig: otherConfig };
    }
    // either no baseConfig, or baseConfig is also different from both: other and local. that's a conflict.
    const mergeStrategyConfigParams = { id, currentConfig, otherConfig, baseConfig };
    return this.basicConflictGenerator(mergeStrategyConfigParams);
  }

  private basicConflictGenerator({
    id,
    currentConfig,
    otherConfig,
  }: MergeStrategyParamsWithRemoved): MergeStrategyResult {
    // uncomment to debug
    // console.log('basicConflictGenerator', this.compIdStr, id, 'currentConfig', currentConfig, 'otherConfig', otherConfig);
    let conflict: string;
    if (currentConfig === '-') {
      conflict = `${'<'.repeat(7)} ${this.currentLabel}
=======
  "${id}": ${JSON.stringify(otherConfig, undefined, 2)}
${'>'.repeat(7)} ${this.otherLabel}`;
    } else if (otherConfig === '-') {
      conflict = `${'<'.repeat(7)} ${this.currentLabel}
  "${id}": ${JSON.stringify(otherConfig, undefined, 2)}
=======
${'>'.repeat(7)} ${this.otherLabel}`;
    } else {
      const formatConfig = (conf: GenericConfigOrRemoved) => {
        const confStr = JSON.stringify(conf, undefined, 2);
        const confStrSplit = confStr.split('\n');
        confStrSplit.shift(); // remove first {
        confStrSplit.pop(); // remove last }
        return confStrSplit.join('\n');
      };
      conflict = `"${id}": {
${'<'.repeat(7)} ${this.currentLabel}
${formatConfig(currentConfig)}
=======
${formatConfig(otherConfig)}
${'>'.repeat(7)} ${this.otherLabel}
}`;
    }

    return { id, conflict };
  }

  private depResolverStrategy(params: MergeStrategyParams): MergeStrategyResult | undefined {
    if (params.id !== DependencyResolverAspect.id) return undefined;
    const { currentExt, otherExt, baseExt } = params;

    const currentConfig = this.getConfig(currentExt);
    const otherConfig = this.getConfig(otherExt);
    const baseConfig = baseExt ? this.getConfig(baseExt) : undefined;
    // const mergeStrategyConfigParams = { id, currentConfig, otherConfig, baseConfig };

    const mergedPolicy = {
      dependencies: [],
      devDependencies: [],
      peerDependencies: [],
    };
    const conflictedPolicy = {
      dependencies: [],
      devDependencies: [],
      peerDependencies: [],
    };
    let isMerged = false;
    let hasConflict = false;
    const conflictIndicator = 'CONFLICT::';
    const nonPolicyConfigToMerged = {};
    const nonPolicyConfigConflict = {};
    const handleConfigMerge = () => {
      if (this.areConfigsEqual(currentConfig, otherConfig)) {
        return;
      }
      if (baseConfig && this.areConfigsEqual(baseConfig, otherConfig)) {
        // was changed on current
        return;
      }
      if (currentConfig === '-' || otherConfig === '-') {
        throw new Error('not implemented. Is it possible to have it as minus?');
      }
      const allKeys = uniq([...Object.keys(currentConfig), ...Object.keys(otherConfig)]);
      const otherKeys = allKeys.filter((key) => key !== 'policy');
      if (baseConfig && this.areConfigsEqual(baseConfig, currentConfig)) {
        // was changed on other
        otherKeys.forEach((key) => {
          if (otherConfig[key]) {
            nonPolicyConfigToMerged[key] = otherConfig[key];
          }
        });
        if (otherConfig.policy) {
          ['dependencies', 'devDependencies', 'peerDependencies'].forEach((depType) => {
            if (!otherConfig.policy[depType]) return;
            Object.keys(otherConfig.policy[depType]).forEach((depName) => {
              mergedPolicy[depType].push({
                name: depName,
                version: otherConfig.policy[depType][depName],
                force: true,
              });
            });
          });
        }
        isMerged = true;
        return;
      }

      // either no baseConfig, or baseConfig is also different from both: other and local. that's a conflict.
      // we have to differentiate between a conflict in the policy, which might be merged with conflict with dependencies data.
      // and a conflict with other fields of config.
      otherKeys.forEach((key) => {
        if (JSON.stringify(currentConfig[key]) === JSON.stringify(otherConfig[key])) {
          return;
        }
        if (baseConfig && JSON.stringify(baseConfig[key]) === JSON.stringify(otherConfig[key])) {
          // was changed on current
          return;
        }
        if (baseConfig && JSON.stringify(baseConfig[key]) === JSON.stringify(currentConfig[key])) {
          // was changed on other
          nonPolicyConfigToMerged[key] = otherConfig[key];
          return;
        }
        // conflict
        nonPolicyConfigConflict[key] = { current: currentConfig[key], other: otherConfig[key] };
      });

      if (!currentConfig.policy && !otherConfig.policy) return;

      ['dependencies', 'devDependencies', 'peerDependencies'].forEach((depType) => {
        const currentPolicy = currentConfig.policy?.[depType];
        const otherPolicy = otherConfig.policy?.[depType];
        const allPolicyKeys = uniq(Object.keys(currentPolicy || {}).concat(Object.keys(otherPolicy || {})));
        if (!allPolicyKeys.length) return;

        allPolicyKeys.forEach((pkgName) => {
          const currentVal = currentPolicy?.[pkgName];
          const otherVal = otherPolicy?.[pkgName];
          const baseVal = baseConfig !== '-' && baseConfig?.policy?.[depType]?.[pkgName];
          if (this.isEnv(pkgName)) {
            // ignore the envs
            return;
          }
          if (currentVal === otherVal) {
            // mergedPolicy[depType][pkgName] = currentVal;
            return;
          }
          if (baseVal === otherVal) {
            // mergedPolicy[depType][pkgName] = currentVal;
            return;
          }
          if (baseVal === currentVal) {
            mergedPolicy[depType].push({
              name: pkgName,
              version: otherVal,
              force: true,
            });
            isMerged = true;
            return;
          }
          // either no baseVal, or baseVal is also different from both: other and local. that's a conflict.
          hasConflict = true;
          conflictedPolicy[depType].push({
            name: pkgName,
            version: `${conflictIndicator}${currentVal}::${otherVal}::`,
            force: true,
          });
        });
      });
    };

    handleConfigMerge();

    const lifecycleToDepType = {
      runtime: 'dependencies',
      dev: 'devDependencies',
      peer: 'peerDependencies',
    };
    const hasConfigForDep = (depType: string, depName: string) => mergedPolicy[depType].find((d) => d.name === depName);
    const addSerializedDepToPolicy = (dep: SerializedDependency) => {
      const depType = lifecycleToDepType[dep.lifecycle];

      if (hasConfigForDep(depType, dep.id)) {
        return; // there is already config for it.
      }
      mergedPolicy[depType].push({
        name: dep.id,
        version: dep.version,
        force: false,
      });
      isMerged = true;
    };

    const getAutoDeps = (ext: ExtensionDataList): SerializedDependency[] => {
      const data = ext.findCoreExtension(DependencyResolverAspect.id)?.data.dependencies;
      if (!data) return [];
      return data
        .filter((d) => d.source === 'auto')
        .map((d) => {
          return {
            ...d,
            id: d.__type === 'package' ? d.id : d.id.split('@')[0],
          };
        });
    };

    const currentData = getAutoDeps(this.currentAspects);
    const otherData = getAutoDeps(this.otherAspects);
    const currentAndOtherData = uniqBy(currentData.concat(otherData), (d) => d.id);
    const baseData = getAutoDeps(this.baseAspects);

    // uncomment to debug
    // console.log('\n\n**************', this.compIdStr, '**************');
    // console.log('currentData', currentData.length, '\n', currentData.map((d) => `${d.__type} ${d.id} ${d.version}`).join('\n'));
    // console.log('otherData', otherData.length, '\n', otherData.map((d) => `${d.__type} ${d.id} ${d.version}`).join('\n'));
    // console.log('otherData', baseData.length, '\n', baseData.map((d) => `${d.__type} ${d.id} ${d.version}`).join('\n'));
    // console.log('** END **\n\n');

    currentAndOtherData.forEach((depData) => {
      if (this.isEnv(depData.id)) {
        // ignore the envs
        return;
      }
      const currentDep = currentData.find((d) => d.id === depData.id);
      const otherDep = otherData.find((d) => d.id === depData.id);
      if (!otherDep) {
        return;
      }
      if (!currentDep) {
        // only on other
        addSerializedDepToPolicy(otherDep);
        return;
      }
      const currentId = currentDep.id;
      if (currentDep.version === otherDep.version) {
        return;
      }
      const baseDep = baseData.find((d) => d.id === currentId);
      if (baseDep && baseDep.version === otherDep.version) {
        return;
      }
      if (currentDep.__type === 'component' && this.isIdInWorkspace(currentId)) {
        // dependencies that exist in the workspace, should be ignored. they'll be resolved later to the version in the ws.
        return;
      }
      if (baseDep && baseDep.version === currentDep.version) {
        addSerializedDepToPolicy(otherDep);
        return;
      }
      // either no baseVal, or baseVal is also different from both: other and local. that's a conflict.
      hasConflict = true;
      const depType = lifecycleToDepType[currentDep.lifecycle];
      if (hasConfigForDep(depType, currentDep.id)) return; // there is already config for it.
      conflictedPolicy[depType].push({
        name: currentDep.id,
        version: `${conflictIndicator}${currentDep.version}::${otherDep.version}::`,
        force: false,
      });
    });

    ['dependencies', 'devDependencies', 'peerDependencies'].forEach((depType) => {
      if (!mergedPolicy[depType].length) delete mergedPolicy[depType];
      if (!conflictedPolicy[depType].length) delete conflictedPolicy[depType];
    });

    let conflictStr: string | undefined;
    if (hasConflict) {
      const mergedConfigSplit = JSON.stringify({ policy: conflictedPolicy }, undefined, 2).split('\n');
      const conflictLines = mergedConfigSplit.map((line) => {
        if (!line.includes(conflictIndicator)) return line;
        const [, currentVal, otherVal] = line.split('::');
        return `${'<'.repeat(7)} ${this.currentLabel}
        "version": "${currentVal}",
=======
        "version": "${otherVal}",
${'>'.repeat(7)} ${this.otherLabel}`;
      });
      // replace the first line with line with the id
      conflictLines.shift();
      conflictLines.unshift(`"${params.id}": {`);
      conflictStr = conflictLines.join('\n');
    }
    const config = isMerged ? { ...nonPolicyConfigToMerged, policy: mergedPolicy } : undefined;

    return { id: params.id, mergedConfig: config, conflict: conflictStr };
  }

  private isIdInWorkspace(id: string): boolean {
    return Boolean(this.workspaceIds.find((c) => c.toStringWithoutVersion() === id));
  }

  private isEnv(id: string) {
    return id === this.currentEnv.id || id === this.otherEnv.id;
  }

  private getConfig(ext: ExtensionDataEntry) {
    if (ext.rawConfig === '-') return ext.rawConfig;
    return omit(ext.rawConfig, ['__specific']);
  }
}
