import { ComponentID } from '@teambit/component-id';
import { DependencyResolverAspect, SerializedDependency } from '@teambit/dependency-resolver';
import { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { compact, omit, uniq } from 'lodash';
import { ConfigMergeResult } from './config-merge-result';

type GenericConfigOrRemoved = Record<string, any> | '-';

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

export class ConfigMerger {
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
    const handledExtIds: string[] = [];
    const results = this.currentAspects.map((currentExt) => {
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
        return this.basicConflictGenerator({ id, currentConfig: this.getConfig(currentExt), otherConfig: '-' });
      }
      // exist in current but not in other and base, so it got created on current. nothing to do.
      return null;
    });
    const otherAspectsNotHandled = this.otherAspects.filter((otherExt) => !handledExtIds.includes(otherExt.stringId));
    const otherAspectsNotHandledResults = otherAspectsNotHandled.map((otherExt) => {
      const id = otherExt.stringId;
      handledExtIds.push(id);
      const baseExt = this.baseAspects.findExtension(id, true);
      if (baseExt) {
        // was removed on current
        return this.basicConflictGenerator({ id, currentConfig: '-', otherConfig: this.getConfig(otherExt) });
      }
      // exist in other but not in current and base, so it got created on other.
      return { id, mergedConfig: this.getConfig(otherExt) };
    });
    // console.log('...results, ...otherAspectsNotHandledResults', ...results, ...otherAspectsNotHandledResults);
    return new ConfigMergeResult(this.compIdStr, compact([...results, ...otherAspectsNotHandledResults]));
  }

  private areConfigsEqual(configA: GenericConfigOrRemoved, configB: GenericConfigOrRemoved) {
    return JSON.stringify(configA) === JSON.stringify(configB);
  }

  private mergePerStrategy(mergeStrategyParams: MergeStrategyParams): MergeStrategyResult | null {
    const { id, currentExt, otherExt, baseExt } = mergeStrategyParams;
    const depResolverResult = this.depResolverStrategy(mergeStrategyParams);
    if (depResolverResult) {
      console.log('\n\n*** DepResolverResult', depResolverResult.id, '\n', depResolverResult.conflict);
      return depResolverResult;
    }
    const currentConfig = this.getConfig(currentExt);
    const otherConfig = this.getConfig(otherExt);
    const baseConfig = baseExt ? this.getConfig(baseExt) : undefined;

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
    console.log(
      'basicConflictGenerator',
      this.compIdStr,
      id,
      'currentConfig',
      currentConfig,
      'otherConfig',
      otherConfig
    );
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
        return confStrSplit.join('\n  ');
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
    const baseData = getAutoDeps(this.baseAspects);

    console.log('\n\n**************', this.compIdStr, '**************');
    console.log(
      'currentData',
      currentData.length,
      '\n',
      currentData.map((d) => `${d.__type} ${d.id} ${d.version}`).join('\n')
    );
    console.log(
      'otherData',
      otherData.length,
      '\n',
      otherData.map((d) => `${d.__type} ${d.id} ${d.version}`).join('\n')
    );
    console.log('otherData', baseData.length, '\n', baseData.map((d) => `${d.__type} ${d.id} ${d.version}`).join('\n'));
    console.log('** END **\n\n');

    currentData.forEach((currentDep) => {
      const currentId = currentDep.id;
      const otherDep = otherData.find((d) => d.id === currentId);
      if (!otherDep) {
        return;
      }
      if (currentDep.version === otherDep.version) {
        return;
      }
      const baseDep = baseData.find((d) => d.id === currentId);
      if (baseDep && baseDep.version === otherDep.version) {
        return;
      }
      if (
        currentDep.__type === 'component' &&
        this.workspaceIds.find((c) => c.toStringWithoutVersion() === currentId)
      ) {
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
      conflictLines.unshift(`  "${params.id}": {`);
      // join all lines with indentation of 2.
      conflictStr = conflictLines.join('\n  ');
    }
    const config = isMerged ? { ...nonPolicyConfigToMerged, policy: mergedPolicy } : undefined;

    return { id: params.id, mergedConfig: config, conflict: conflictStr };
  }

  private getConfig(ext: ExtensionDataEntry) {
    if (ext.rawConfig === '-') return ext.rawConfig;
    return omit(ext.rawConfig, ['__specific']);
  }
}
