import type { ComponentID } from '@teambit/component-id';
import semver from 'semver';
import type { Logger } from '@teambit/logger';
import { BuilderAspect } from '@teambit/builder';
import { isHash } from '@teambit/component-version';
import type { SerializedDependency, VariantPolicyEntry } from '@teambit/dependency-resolver';
import { DependencyResolverAspect, VariantPolicy } from '@teambit/dependency-resolver';
import type { Lane } from '@teambit/objects';
import { EnvsAspect } from '@teambit/envs';
import type { ExtensionDataEntry, ExtensionDataList } from '@teambit/legacy.extension-data';
import type { MergeStrategy } from '@teambit/component.modules.merge-helper';
import { compact, omit, uniqBy } from 'lodash';
import { ConfigMergeResult } from './config-merge-result';

export type GenericConfigOrRemoved = Record<string, any> | '-';

type EnvData = { id: string; version?: string; config?: GenericConfigOrRemoved };

type SerializedDependencyWithPolicy = SerializedDependency & { policy?: string; packageName?: string };

export type PolicyDependency = {
  name: string;
  version: string;
  force?: boolean;
};

export const conflictIndicator = 'CONFLICT::';

export type MergeStrategyResult = {
  id: string;
  mergedConfig?: GenericConfigOrRemoved;
  conflict?: Record<string, any>;
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
export class ComponentConfigMerger {
  private currentEnv: EnvData;
  private otherEnv: EnvData;
  private baseEnv?: EnvData;
  private handledExtIds: string[] = [BuilderAspect.id]; // don't try to merge builder, it's possible that at one end it wasn't built yet, so it's empty
  private otherLaneIdsStr: string[];
  constructor(
    private compIdStr: string,
    private workspaceIds: ComponentID[],
    otherLane: Lane | undefined,
    private currentAspects: ExtensionDataList,
    private baseAspects: ExtensionDataList,
    private otherAspects: ExtensionDataList,
    private currentLabel: string,
    private otherLabel: string,
    private logger: Logger,
    private mergeStrategy: MergeStrategy
  ) {
    this.otherLaneIdsStr = otherLane?.toComponentIds().map((id) => id.toString()) || [];
  }

  merge(): ConfigMergeResult {
    this.logger.debug(`\n************** start config-merger for ${this.compIdStr} **************`);
    this.logger.debug(`currentLabel: ${this.currentLabel}`);
    this.logger.debug(`otherLabel: ${this.otherLabel}`);
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
        if (this.mergeStrategy === 'theirs') {
          return { id, mergedConfig: '-' } as MergeStrategyResult;
        }
        if (this.mergeStrategy === 'ours') {
          return null;
        }
        return { id, conflict: { currentConfig: this.getConfig(currentExt), otherConfig: '-' } };
      }
      // exist in current but not in other and base, so it got created on current. nothing to do.
      return null;
    });
    const otherAspectsNotHandledResults = this.otherAspects.map((otherExt) => {
      let id = otherExt.stringId;
      if (this.handledExtIds.includes(id)) return null;
      this.handledExtIds.push(id);
      if (otherExt.extensionId && otherExt.extensionId.hasVersion()) {
        // avoid using the id from the other lane if it exits in the workspace. prefer the id from the workspace.
        const idFromWorkspace = this.getIdFromWorkspace(otherExt.extensionId.toStringWithoutVersion());
        if (idFromWorkspace) {
          const existingExt = this.currentAspects.findExtension(otherExt.extensionId.toStringWithoutVersion(), true);
          if (existingExt) return null; // the aspect is set currently, no need to add it again.
          id = idFromWorkspace._legacy.toString();
        }
      }
      const baseExt = this.baseAspects.findExtension(id, true);
      if (baseExt) {
        // was removed on current
        return { id, conflict: { currentConfig: '-', otherConfig: this.getConfig(otherExt) } };
      }
      // exist in other but not in current and base, so it got created on other.
      return { id, mergedConfig: this.getConfig(otherExt) };
    });
    const envResult = this.envStrategy();
    this.logger.debug(`*** end config-merger for ${this.compIdStr} ***\n`);
    return new ConfigMergeResult(
      this.compIdStr,
      this.currentLabel,
      this.otherLabel,
      compact([...results, ...otherAspectsNotHandledResults, envResult])
    );
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
      this.currentEnv.config = this.getConfig(currentEnvAspect);
    }
    const otherEnvAspect = this.otherAspects.findExtension(otherEnv, true);
    if (otherEnvAspect) {
      this.handledExtIds.push(otherEnvAspect.stringId);
      this.otherEnv.version = otherEnvAspect.extensionId?.version;
      this.otherEnv.config = this.getConfig(otherEnvAspect);
    }
    if (this.baseEnv) {
      const baseEnvAspect = this.baseAspects.findExtension(baseEnv, true);
      if (baseEnvAspect) {
        this.baseEnv.version = baseEnvAspect.extensionId?.version;
        this.baseEnv.config = this.getConfig(baseEnvAspect);
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
    if (this.isIdInWorkspaceOrOtherLane(this.currentEnv.id, this.otherEnv.version)) {
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
      // if (depResolverResult.mergedConfig || depResolverResult?.conflict) console.log("\n\nDepResolverResult", this.compIdStr, '\n', JSON.stringify(depResolverResult, undefined, 2))
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
    if (this.mergeStrategy === 'theirs') {
      return { id, mergedConfig: otherConfig };
    }
    if (this.mergeStrategy === 'ours') {
      return null;
    }
    return { id, conflict: { currentConfig, otherConfig, baseConfig } };
  }

  /**
   * Performs a specialized 3-way merge for the dependency-resolver aspect configuration.
   *
   * This method handles merging of dependency configurations which is more complex than other aspects because:
   * 1. Dependencies come from TWO sources:
   *    - Config (policy): explicitly configured by user (marked with force: true)
   *    - Data (auto): automatically detected from import statements in code (source: 'auto')
   * 2. We need to merge both sources together to get the complete dependency picture
   *
   * The merge process:
   * 1. Handles config policy merge (explicit dependencies):
   *    - Compares each dependency in current vs other vs base config policies
   *    - Uses 3-way merge: if base==other, use current; if base==current, use other; else conflict
   *    - Skips dependencies that exist in workspace or other lane (they'll be resolved locally)
   *
   * 2. Handles data dependencies merge (auto-detected dependencies):
   *    - Merges auto-detected deps from both current and other
   *    - For each dependency, determines if it should be added, kept, or marked as conflict
   *    - Ignores environment dependencies (handled separately by envStrategy)
   *    - Skips workspace dependencies (resolved to workspace version)
   *
   * 3. Conflict detection:
   *    - Version conflicts marked with special format: "CONFLICT::currentVer::otherVer::"
   *    - Respects merge strategy (ours/theirs/manual) for automatic resolution
   *
   * Returns:
   * - undefined if this is not the dependency-resolver aspect
   * - MergeStrategyResult with either:
   *   - mergedConfig: successfully merged dependency policy
   *   - conflict: conflicted dependencies marked with version conflicts
   */
  private depResolverStrategy(params: MergeStrategyParams): MergeStrategyResult | undefined {
    if (params.id !== DependencyResolverAspect.id) return undefined;
    this.logger.trace(`start depResolverStrategy for ${this.compIdStr}`);
    const { currentExt, otherExt, baseExt } = params;

    const currentConfig = this.getConfig(currentExt);
    const currentConfigPolicy = this.getPolicy(currentConfig);
    const otherConfig = this.getConfig(otherExt);
    const otherConfigPolicy = this.getPolicy(otherConfig);

    const baseConfig = baseExt ? this.getConfig(baseExt) : undefined;
    const baseConfigPolicy = baseConfig ? this.getPolicy(baseConfig) : undefined;

    this.logger.debug(`currentConfig, ${JSON.stringify(currentConfig, undefined, 2)}`);
    this.logger.debug(`otherConfig, ${JSON.stringify(otherConfig, undefined, 2)}`);
    this.logger.debug(`baseConfig, ${JSON.stringify(baseConfig, undefined, 2)}`);

    const getAllDeps = (ext: ExtensionDataList): SerializedDependencyWithPolicy[] => {
      const data = ext.findCoreExtension(DependencyResolverAspect.id)?.data.dependencies;
      if (!data) return [];
      const policy = ext.findCoreExtension(DependencyResolverAspect.id)?.data.policy || [];
      return data.map((d) => {
        const idWithoutVersion = d.__type === 'package' ? d.id : d.id.split('@')[0];
        const existingPolicy = policy.find((p) => p.dependencyId === idWithoutVersion);
        const getPolicyVer = () => {
          if (d.__type === 'package') return undefined; // for packages, the policy is already the version
          if (existingPolicy) return existingPolicy.value.version; // currently it's missing, will be implemented by @Gilad
          return d.version;
          // if (!semver.valid(d.version)) return d.version; // could be a hash
          // // default to `^` or ~ if starts with zero, until we save the policy from the workspace during tag/snap.
          // return d.version.startsWith('0.') ? `~${d.version}` : `^${d.version}`;
        };
        return {
          ...d,
          id: idWithoutVersion,
          policy: getPolicyVer(),
        };
      });
    };
    const getDataPolicy = (ext: ExtensionDataList): VariantPolicyEntry[] => {
      return ext.findCoreExtension(DependencyResolverAspect.id)?.data.policy || [];
    };

    const getAutoDeps = (ext: ExtensionDataList): SerializedDependencyWithPolicy[] => {
      const allDeps = getAllDeps(ext);
      return allDeps.filter((d) => d.source === 'auto');
    };

    const currentAutoData = getAutoDeps(this.currentAspects);
    const currentAllData = getAllDeps(this.currentAspects);
    const currentDataPolicy = getDataPolicy(this.currentAspects);
    const otherData = getAutoDeps(this.otherAspects);
    const currentAndOtherData = uniqBy(currentAutoData.concat(otherData), (d) => d.id);
    const currentAndOtherComponentsData = currentAndOtherData.filter((c) => c.__type === 'component');
    const baseData = getAutoDeps(this.baseAspects);

    const getCompIdStrByPkgNameFromData = (pkgName: string): string | undefined => {
      const found = currentAndOtherComponentsData.find((d) => d.packageName === pkgName);
      return found?.id;
    };

    const getFromCurrentDataByPackageName = (pkgName: string) => {
      return currentAllData.find((d) => {
        if (d.__type === 'package') return d.id === pkgName;
        return d.packageName === pkgName;
      });
    };

    const getFromCurrentDataPolicyByPackageName = (pkgName: string) => {
      return currentDataPolicy.find((d) => d.dependencyId === pkgName);
    };

    const mergedPolicy: Record<string, PolicyDependency[]> = {
      dependencies: [],
      devDependencies: [],
      peerDependencies: [],
    };
    const conflictedPolicy: Record<string, PolicyDependency[]> = {
      dependencies: [],
      devDependencies: [],
      peerDependencies: [],
    };
    let hasConflict = false;
    const lifecycleToDepType = {
      runtime: 'dependencies',
      dev: 'devDependencies',
      peer: 'peerDependencies',
    };
    const handleConfigMerge = () => {
      const addVariantPolicyEntryToPolicy = (dep: VariantPolicyEntry) => {
        const compIdStr = getCompIdStrByPkgNameFromData(dep.dependencyId);
        if (compIdStr && this.isIdInWorkspaceOrOtherLane(compIdStr, dep.value.version)) {
          // no need to add if the id exists in the workspace (regardless the version)
          return;
        }
        const fromCurrentData = getFromCurrentDataByPackageName(dep.dependencyId);
        if (fromCurrentData && !dep.force) {
          if (fromCurrentData.version === dep.value.version) return;
          if (
            !isHash(fromCurrentData.version) &&
            !isHash(dep.value.version) &&
            semver.satisfies(fromCurrentData.version, dep.value.version)
          ) {
            return;
          }
        }
        const fromCurrentDataPolicy = getFromCurrentDataPolicyByPackageName(dep.dependencyId);
        if (fromCurrentDataPolicy && fromCurrentDataPolicy.value.version === dep.value.version) {
          // -- updated comment --
          // not sure why this block is needed. this gets called also from this if: `if (baseConfig && this.areConfigsEqual(baseConfig, currentConfig)) {`
          // and in this case, it's possible that current/base has 5 deps, and other just added one and it has 6.
          // in which case, we do need to add all these 5 in additional to the new one. otherwise, only the new one appears in the final
          // merged object, and all the 5 deps are lost.
          // --- previous comment ---
          // that's a bug. if it's in the data.policy, it should be in data.dependencies.
          // return;
        }
        const depType = lifecycleToDepType[dep.lifecycleType];
        mergedPolicy[depType].push({
          name: dep.dependencyId,
          version: dep.value.version,
          force: dep.force,
        });
      };

      if (this.areConfigsEqual(currentConfig, otherConfig)) {
        // No need to add unchanged config deps here - they will be rescued by
        // mergeScopeSpecificDepsPolicy() in merging.main.runtime during merge processing
        return;
      }
      if (baseConfig && this.areConfigsEqual(baseConfig, otherConfig)) {
        // was changed on current
        // No need to add unchanged config deps here - they will be rescued by
        // mergeScopeSpecificDepsPolicy() in merging.main.runtime during merge processing
        return;
      }
      if (currentConfig === '-' || otherConfig === '-') {
        throw new Error('not implemented. Is it possible to have it as minus?');
      }
      if (baseConfig && this.areConfigsEqual(baseConfig, currentConfig)) {
        // was changed on other
        if (otherConfigPolicy.length) {
          otherConfigPolicy.forEach((dep) => {
            addVariantPolicyEntryToPolicy(dep);
          });
        }
        // Check if any dependencies in current were deleted on other
        // If a dependency exists in base and current but not in other, it was deleted on other
        currentConfigPolicy.forEach((currentDep) => {
          const baseDep = baseConfigPolicy?.find((d) => d.dependencyId === currentDep.dependencyId);
          const otherDep = otherConfigPolicy.find((d) => d.dependencyId === currentDep.dependencyId);
          if (baseDep && !otherDep) {
            // Dependency was deleted on other - add it with version: '-' to mark for deletion
            const depType = lifecycleToDepType[currentDep.lifecycleType];
            mergedPolicy[depType].push({
              name: currentDep.dependencyId,
              version: '-',
            });
          }
        });
        return;
      }

      // either no baseConfig, or baseConfig is also different from both: other and local. that's a conflict.
      if (!currentConfig.policy && !otherConfig.policy) return;
      const currentAndOtherConfig = uniqBy(currentConfigPolicy.concat(otherConfigPolicy), (d) => d.dependencyId);
      currentAndOtherConfig.forEach((dep) => {
        const depType = lifecycleToDepType[dep.lifecycleType];
        const currentDep = currentConfigPolicy.find((d) => d.dependencyId === dep.dependencyId);
        const otherDep = otherConfigPolicy.find((d) => d.dependencyId === dep.dependencyId);
        const baseDep = baseConfigPolicy?.find((d) => d.dependencyId === dep.dependencyId);

        if (!otherDep) {
          return;
        }
        if (!currentDep) {
          // only on other
          addVariantPolicyEntryToPolicy(otherDep);
          return;
        }
        const currentVer = currentDep.value.version;
        const otherVer = otherDep.value.version;
        if (currentVer === otherVer) {
          return;
        }
        const baseVer = baseDep?.value.version;
        if (baseVer && baseVer === otherVer) {
          return;
        }
        if (baseVer && baseVer === currentVer) {
          addVariantPolicyEntryToPolicy(otherDep);
          return;
        }
        const compIdStr = getCompIdStrByPkgNameFromData(dep.dependencyId);
        if (compIdStr && this.isIdInWorkspaceOrOtherLane(compIdStr, otherVer)) {
          // no need to add if the id exists in the workspace (regardless the version)
          return;
        }
        if (this.mergeStrategy === 'theirs') {
          addVariantPolicyEntryToPolicy(otherDep);
          return;
        }
        if (this.mergeStrategy === 'ours') {
          return;
        }

        hasConflict = true;
        conflictedPolicy[depType].push({
          name: currentDep.dependencyId,
          version: `${conflictIndicator}${currentVer}::${otherVer}::`,
          force: currentDep.force,
        });
      });
    };

    handleConfigMerge();

    const hasConfigForDep = (depType: string, depName: string) => mergedPolicy[depType].find((d) => d.name === depName);
    const getDepIdAsPkgName = (dep: SerializedDependencyWithPolicy): string => {
      if (dep.__type !== 'component') {
        return dep.id;
      }
      return dep.packageName!;
    };

    const addSerializedDepToPolicy = (dep: SerializedDependencyWithPolicy) => {
      const depType = lifecycleToDepType[dep.lifecycle];
      if (dep.__type === 'component' && this.isIdInWorkspaceOrOtherLane(dep.id, dep.version)) {
        return;
      }
      if (hasConfigForDep(depType, dep.id)) {
        return; // there is already config for it.
      }
      mergedPolicy[depType].push({
        name: getDepIdAsPkgName(dep),
        version: dep.policy || dep.version,
        force: false,
      });
    };

    this.logger.debug(
      `currentData, ${currentAllData.length}\n${currentAllData
        .map((d) => `${d.__type} ${d.id} ${d.version}`)
        .join('\n')}`
    );
    this.logger.debug(
      `otherData, ${otherData.length}\n${otherData.map((d) => `${d.__type} ${d.id} ${d.version}`).join('\n')}`
    );
    this.logger.debug(
      `baseData, ${baseData.length}\n${baseData.map((d) => `${d.__type} ${d.id} ${d.version}`).join('\n')}`
    );

    // eslint-disable-next-line complexity
    currentAndOtherData.forEach((depData) => {
      this.logger.trace(`depData.id, ${depData.id}`);
      if (this.isEnv(depData.id)) {
        // ignore the envs
        return;
      }
      const currentDep = currentAllData.find((d) => d.id === depData.id);
      const otherDep = otherData.find((d) => d.id === depData.id);
      const baseDep = baseData.find((d) => d.id === depData.id);

      this.logger.trace(`currentDep`, currentDep);
      this.logger.trace(`otherDep`, otherDep);
      this.logger.trace(`baseDep`, baseDep);
      if (!otherDep) {
        return;
      }
      if (!currentDep) {
        if (baseDep) {
          // exists in other and base, so it was removed from current
          return;
        }
        // only on other
        addSerializedDepToPolicy(otherDep);
        return;
      }

      if (currentDep.policy && otherDep.policy) {
        if (semver.satisfies(currentDep.version, otherDep.policy)) {
          return;
        }
        if (semver.satisfies(otherDep.version, currentDep.policy)) {
          return;
        }
      }

      const currentVer = currentDep.policy || currentDep.version;
      const otherVer = otherDep.policy || otherDep.version;
      if (currentVer === otherVer) {
        return;
      }
      const baseVer = baseDep?.policy || baseDep?.version;
      if (baseVer && baseVer === otherVer) {
        return;
      }
      const currentId = currentDep.id;
      if (currentDep.__type === 'component' && this.isIdInWorkspaceOrOtherLane(currentId, otherDep.version)) {
        // dependencies that exist in the workspace, should be ignored. they'll be resolved later to the version in the ws.
        return;
      }
      const depType = lifecycleToDepType[currentDep.lifecycle];
      if (hasConfigForDep(depType, currentDep.id)) {
        return; // there is already config for it.
      }
      if (baseVer && baseVer === currentVer) {
        addSerializedDepToPolicy(otherDep);
        return;
      }
      if (this.mergeStrategy === 'theirs') {
        addSerializedDepToPolicy(otherDep);
        return;
      }
      if (this.mergeStrategy === 'ours') {
        return;
      }
      hasConflict = true;
      conflictedPolicy[depType].push({
        name: getDepIdAsPkgName(currentDep),
        version: `${conflictIndicator}${currentVer}::${otherVer}::`,
        force: false,
      });
    });

    ['dependencies', 'devDependencies', 'peerDependencies'].forEach((depType) => {
      if (!mergedPolicy[depType].length) delete mergedPolicy[depType];
      if (!conflictedPolicy[depType].length) delete conflictedPolicy[depType];
    });

    const config = Object.keys(mergedPolicy).length ? { policy: mergedPolicy } : undefined;
    const conflict = hasConflict ? conflictedPolicy : undefined;

    this.logger.debug('final mergedConfig', config);
    this.logger.debug('final conflict', conflict);

    return { id: params.id, mergedConfig: config, conflict };
  }

  private isIdInWorkspaceOrOtherLane(id: string, versionOnOtherLane?: string): boolean {
    return Boolean(this.getIdFromWorkspace(id)) || this.otherLaneIdsStr.includes(`${id}@${versionOnOtherLane}`);
  }

  private getIdFromWorkspace(id: string): ComponentID | undefined {
    return this.workspaceIds.find((c) => c.toStringWithoutVersion() === id);
  }

  private isEnv(id: string) {
    return id === this.currentEnv.id || id === this.otherEnv.id;
  }

  private getConfig(ext: ExtensionDataEntry): GenericConfigOrRemoved {
    if (ext.rawConfig === '-') return ext.rawConfig;
    return omit(ext.rawConfig, ['__specific']);
  }

  private getPolicy(config): VariantPolicyEntry[] {
    if (!config.policy) return [];
    return VariantPolicy.fromConfigObject(config.policy).entries;
  }
}
