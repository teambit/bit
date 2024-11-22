import { Harmony } from '@teambit/harmony';
import { Component } from '@teambit/component';
import { UnmergedComponent } from '@teambit/legacy/dist/scope/lanes/unmerged-components';
import { ComponentID } from '@teambit/component-id';
import { EnvsAspect } from '@teambit/envs';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { ExtensionDataList, getCompareExtPredicate } from '@teambit/legacy/dist/consumer/config/extension-data';
import { partition, mergeWith, merge, uniq, uniqWith, compact } from 'lodash';
import { MergeConfigConflict } from './exceptions/merge-config-conflict';
import { AspectSpecificField, ExtensionsOrigin, Workspace } from './workspace';
import { MergeConflictFile } from './merge-conflict-file';

export class AspectsMerger {
  readonly mergeConflictFile: MergeConflictFile;
  private mergeConfigDepsResolverDataCache: { [compIdStr: string]: Record<string, any> } = {};
  constructor(
    private workspace: Workspace,
    private harmony: Harmony
  ) {
    this.mergeConflictFile = new MergeConflictFile(workspace.path);
  }

  getDepsDataOfMergeConfig(id: ComponentID) {
    return this.mergeConfigDepsResolverDataCache[id.toString()];
  }

  /**
   * Calculate the component config based on:
   * the config property in the .bitmap file
   * the component.json file in the component folder
   * matching pattern in the variants config
   * defaults extensions from workspace config
   * extensions from the model.
   */
  // eslint-disable-next-line complexity
  async merge(
    componentId: ComponentID,
    componentFromScope?: Component,
    excludeOrigins: ExtensionsOrigin[] = []
  ): Promise<{
    extensions: ExtensionDataList;
    beforeMerge: Array<{ extensions: ExtensionDataList; origin: ExtensionsOrigin; extraData: any }>; // useful for debugging
    errors?: Error[];
  }> {
    // TODO: consider caching this result
    let configFileExtensions: ExtensionDataList | undefined;
    let variantsExtensions: ExtensionDataList | undefined;
    const mergeFromScope = true;
    const errors: Error[] = [];

    const bitMapEntry = this.workspace.consumer.bitMap.getComponentIfExist(componentId);
    const bitMapExtensions = bitMapEntry?.config;

    let configMerge: Record<string, any> | undefined;
    try {
      configMerge = this.mergeConflictFile.getConflictParsed(componentId.toStringWithoutVersion());
    } catch (err) {
      if (!(err instanceof MergeConfigConflict)) {
        throw err;
      }
      this.workspace.logger.error(`unable to parse the config file for ${componentId.toString()} due to conflicts`);
      errors.push(err);
    }

    const adjustEnvsOnConfigMerge = (conf: Record<string, any>) => {
      const env = conf[EnvsAspect.id]?.env;
      if (!env) return;
      const [id] = env.split('@');
      conf[EnvsAspect.id] = { env: id };
      conf[env] = {};
    };

    const unmergedData = this.getUnmergedData(componentId);
    const unmergedDataMergeConf = unmergedData?.mergedConfig;
    const getMergeConfigCombined = () => {
      if (!configMerge && !unmergedDataMergeConf) return undefined;
      if (!configMerge) return unmergedDataMergeConf;
      if (!unmergedDataMergeConf) return configMerge;

      return mergeWith(configMerge, unmergedDataMergeConf, (objValue, srcValue) => {
        if (Array.isArray(objValue)) {
          // critical for dependencyResolver.policy.*dependencies. otherwise, it will override the array
          return objValue.concat(srcValue);
        }
        return undefined;
      });
    };
    const mergeConfigCombined = getMergeConfigCombined();
    adjustEnvsOnConfigMerge(mergeConfigCombined || {});

    const configMergeExtensions = mergeConfigCombined
      ? ExtensionDataList.fromConfigObject(mergeConfigCombined)
      : undefined;

    this.removeAutoDepsFromConfig(componentId, configMergeExtensions);
    const scopeExtensions = this.getComponentFromScopeWithoutDuplications(componentFromScope);
    // backward compatibility. previously, it was saved as an array into the model (when there was merge-config)
    this.removeAutoDepsFromConfig(componentId, scopeExtensions, true);
    const [specific, nonSpecific] = partition(scopeExtensions, (entry) => entry.config[AspectSpecificField] === true);
    const scopeExtensionsNonSpecific = new ExtensionDataList(...nonSpecific);
    const scopeExtensionsSpecific = new ExtensionDataList(...specific);

    this.addConfigDepsFromModelToConfigMerge(scopeExtensionsSpecific, mergeConfigCombined);

    const componentConfigFile = await this.workspace.componentConfigFile(componentId);
    if (componentConfigFile) {
      configFileExtensions = componentConfigFile.aspects.toLegacy();
    }
    const relativeComponentDir = this.workspace.componentDir(componentId, { ignoreVersion: true }, { relative: true });
    const variantConfig = this.workspace.variants.byRootDirAndName(relativeComponentDir, componentId.fullName);
    if (variantConfig) {
      variantsExtensions = variantConfig.extensions.clone();
      // Do not merge from scope when there is specific variant (which is not *) that match the component
      // if (variantConfig.maxSpecificity > 0) {
      //   mergeFromScope = false;
      // }
    }
    // We don't stop on each step because we want to merge the default scope even if propagate=false but the default scope is not defined
    // in the case the same extension pushed twice, the former takes precedence (opposite of Object.assign)
    const extensionsToMerge: Array<{ origin: ExtensionsOrigin; extensions: ExtensionDataList; extraData: any }> = [];
    let envWasFoundPreviously = false;
    const removedExtensionIds: string[] = [];

    const addExtensionsToMerge = async (extensions: ExtensionDataList, origin: ExtensionsOrigin, extraData?: any) => {
      if (!extensions.length) {
        return;
      }
      removedExtensionIds.push(...extensions.filter((extData) => extData.isRemoved).map((extData) => extData.stringId));
      const extsWithoutRemoved = extensions.filterRemovedExtensions();
      const selfInMergedExtensions = extsWithoutRemoved.findExtension(componentId.toStringWithoutVersion(), true);
      const extsWithoutSelf = selfInMergedExtensions?.extensionId
        ? extsWithoutRemoved.remove(selfInMergedExtensions.extensionId)
        : extsWithoutRemoved;
      const preferWorkspaceVersion = origin !== 'BitmapFile' && origin !== 'ComponentJsonFile';
      // it's important to do this resolution before the merge, otherwise we have issues with extensions
      // coming from scope with local scope name, as opposed to the same extension comes from the workspace with default scope name
      // also, it's important to do it before filtering the env, because when the env was not exported, it's saved with scope-name
      // inside the "env" prop of teambit.envs/env, but without scope-name in the root.
      const extsWithUpdatedIds = await this.resolveExtensionListIds(extsWithoutSelf, preferWorkspaceVersion);
      const { extensionDataListFiltered, envIsCurrentlySet } = await this.filterEnvsFromExtensionsIfNeeded(
        extsWithUpdatedIds,
        envWasFoundPreviously,
        origin
      );
      if (envIsCurrentlySet) {
        envWasFoundPreviously = true;
      }

      extensionsToMerge.push({ origin, extensions: extensionDataListFiltered, extraData });
    };
    const setDataListAsSpecific = (extensions: ExtensionDataList) => {
      extensions.forEach((dataEntry) => (dataEntry.config[AspectSpecificField] = true));
    };
    if (bitMapExtensions && !excludeOrigins.includes('BitmapFile')) {
      const extensionDataList = ExtensionDataList.fromConfigObject(bitMapExtensions);
      setDataListAsSpecific(extensionDataList);
      await addExtensionsToMerge(extensionDataList, 'BitmapFile');
    }
    // config-merge is after the .bitmap. because normally if you have config set in .bitmap, you won't
    // be able to lane-merge. (unless you specify --ignore-config-changes).
    // so, if there is config in .bitmap, it probably happened after lane-merge.
    if (configMergeExtensions && !excludeOrigins.includes('ConfigMerge')) {
      await addExtensionsToMerge(ExtensionDataList.fromArray(configMergeExtensions), 'ConfigMerge');
    }
    if (configFileExtensions && !excludeOrigins.includes('ComponentJsonFile')) {
      setDataListAsSpecific(configFileExtensions);
      await addExtensionsToMerge(configFileExtensions, 'ComponentJsonFile');
    }
    if (!excludeOrigins.includes('ModelSpecific')) {
      await addExtensionsToMerge(ExtensionDataList.fromArray(scopeExtensionsSpecific), 'ModelSpecific');
    }
    let continuePropagating = componentConfigFile?.propagate ?? true;
    if (variantsExtensions && continuePropagating && !excludeOrigins.includes('WorkspaceVariants')) {
      const appliedRules = variantConfig?.sortedMatches.map(({ pattern, specificity }) => ({ pattern, specificity }));
      await addExtensionsToMerge(variantsExtensions, 'WorkspaceVariants', { appliedRules });
    }
    continuePropagating = continuePropagating && (variantConfig?.propagate ?? true);
    if (mergeFromScope && continuePropagating && !excludeOrigins.includes('ModelNonSpecific')) {
      await addExtensionsToMerge(scopeExtensionsNonSpecific, 'ModelNonSpecific');
    }

    const afterMerge = ExtensionDataList.mergeConfigs(extensionsToMerge.map((ext) => ext.extensions));
    const withoutRemoved = afterMerge.filter((extData) => !removedExtensionIds.includes(extData.stringId));
    const extensions = ExtensionDataList.fromArray(withoutRemoved);
    return {
      extensions,
      beforeMerge: extensionsToMerge,
      errors,
    };
  }

  /**
   * before version 0.0.882 it was possible to save Version object with the same extension twice.
   */
  private getComponentFromScopeWithoutDuplications(componentFromScope?: Component) {
    if (!componentFromScope) return new ExtensionDataList();
    const scopeExtensions = componentFromScope.config.extensions;
    const scopeExtIds = scopeExtensions.ids;
    const scopeExtHasDuplications = scopeExtIds.length !== uniq(scopeExtIds).length;
    if (!scopeExtHasDuplications) {
      return scopeExtensions;
    }
    // let's remove this duplicated extension blindly without trying to merge. (no need to merge coz it's old data from scope
    // which will be overridden anyway by the workspace or other config strategies).
    const arr = uniqWith(scopeExtensions, getCompareExtPredicate(true));
    return ExtensionDataList.fromArray(arr);
  }

  /**
   * from the merge-config we get the dep-resolver policy as an array, because it needs to support "force" prop.
   * however, when we save the config, we want to save it as an object, so we need split the data into two:
   * 1. force: true, which gets saved into the config.
   * 2. force: false, which gets saved into the data.dependencies later on. see the workspace.getAutoDetectOverrides()
   */
  private removeAutoDepsFromConfig(componentId: ComponentID, conf?: ExtensionDataList, fromScope = false) {
    if (!conf) return;
    const policy = conf.findCoreExtension(DependencyResolverAspect.id)?.config.policy;
    if (!policy) return;

    const mergeConfigObj = {};
    ['dependencies', 'devDependencies', 'peerDependencies'].forEach((key) => {
      if (!policy[key]) return;
      // this is only relevant when it is saved as an array. otherwise, it's always force: true.
      if (!Array.isArray(policy[key])) return;

      mergeConfigObj[key] = policy[key].filter((dep) => !dep.force);
      policy[key] = policy[key].filter((dep) => dep.force);

      if (!policy[key].length) {
        delete policy[key];
        return;
      }
      // convert to object
      policy[key] = policy[key].reduce((acc, current) => {
        acc[current.name] = current.version;
        return acc;
      }, {});
    });

    if (!fromScope) {
      if (!this.mergeConfigDepsResolverDataCache[componentId.toString()]) {
        this.mergeConfigDepsResolverDataCache[componentId.toString()] = {};
      }
      this.mergeConfigDepsResolverDataCache[componentId.toString()] = merge(
        this.mergeConfigDepsResolverDataCache[componentId.toString()],
        mergeConfigObj
      );
    }
  }

  /**
   * this is needed because if the mergeConfig has a policy, it will be used, and any other policy along the line will be ignored.
   * in case the model has some dependencies that were set explicitly they're gonna be ignored.
   * this makes sure to add them to the policy of the mergeConfig.
   * in a way, this is similar to what we do when a user is running `bit deps set` and the component had previous dependencies set,
   * we copy those dependencies along with the current one to the .bitmap file, so they won't get lost.
   */
  private addConfigDepsFromModelToConfigMerge(
    scopeExtensionsSpecific: ExtensionDataList,
    mergeConfig?: Record<string, any>
  ) {
    const mergeConfigPolicy = mergeConfig?.[DependencyResolverAspect.id]?.policy;
    if (!mergeConfigPolicy) return;
    const scopePolicy = scopeExtensionsSpecific.findCoreExtension(DependencyResolverAspect.id)?.config.policy;
    if (!scopePolicy) return;
    Object.keys(scopePolicy).forEach((key) => {
      if (!mergeConfigPolicy[key]) {
        mergeConfigPolicy[key] = scopePolicy[key];
        return;
      }
      // mergeConfigPolicy should take precedence over scopePolicy
      mergeConfigPolicy[key] = { ...scopePolicy[key], ...mergeConfigPolicy[key] };
    });
  }

  private getUnmergedData(componentId: ComponentID): UnmergedComponent | undefined {
    return this.workspace.scope.legacyScope.objects.unmergedComponents.getEntry(componentId);
  }

  private async filterEnvsFromExtensionsIfNeeded(
    extensionDataList: ExtensionDataList,
    envWasFoundPreviously: boolean,
    origin: ExtensionsOrigin
  ) {
    const envAspect = extensionDataList.findExtension(EnvsAspect.id);
    const envFromEnvsAspect: string | undefined = envAspect?.config.env || envAspect?.data.id;
    const aspectsRegisteredAsEnvs = extensionDataList
      .filter((aspect) =>
        this.workspace.envs.getEnvDefinitionByStringId(aspect.newExtensionId?.toString() || aspect.stringId)
      )
      .map((aspect) => aspect.stringId);
    if (envWasFoundPreviously && (envAspect || aspectsRegisteredAsEnvs.length)) {
      const nonEnvs = extensionDataList.map((e) => {
        // normally the env-id inside the envs aspect doesn't have a version, but the aspect itself has a version.
        // also, the env-id inside the envs aspect includes the default-scope, but the aspect itself doesn't.
        if (
          (envFromEnvsAspect && e.stringId === envFromEnvsAspect) ||
          (envFromEnvsAspect && e.extensionId?.toStringWithoutVersion() === envFromEnvsAspect) ||
          aspectsRegisteredAsEnvs.includes(e.stringId)
        ) {
          return undefined;
        }
        if (e.stringId === envAspect?.stringId) {
          // must clone the env aspect to avoid mutating the original data
          const clonedEnvAspect = e.clone();
          delete clonedEnvAspect.config.env; // aspect env may have other data other then config.env.
          return clonedEnvAspect;
        }
        return e;
      });

      return { extensionDataListFiltered: new ExtensionDataList(...compact(nonEnvs)), envIsCurrentlySet: true };
    }
    if (envFromEnvsAspect && (origin === 'ModelNonSpecific' || origin === 'ModelSpecific')) {
      // if env was found, search for this env in the workspace and if found, replace the env-id with the one from the workspace
      const envAspectExt = extensionDataList.find((e) => e.extensionId?.toStringWithoutVersion() === envFromEnvsAspect);
      const ids = this.workspace.listIds();
      const envAspectId = envAspectExt?.extensionId;
      const found = envAspectId && ids.find((id) => id.isEqualWithoutVersion(envAspectId));
      if (found) {
        envAspectExt.extensionId = found;
      }
    }
    return { extensionDataListFiltered: extensionDataList, envIsCurrentlySet: Boolean(envFromEnvsAspect) };
  }

  /**
   * This will mutate the entries with extensionId prop to have resolved legacy id
   * This should be worked on the extension data list not the new aspect list
   * @param extensionList
   */
  private async resolveExtensionListIds(
    extensionList: ExtensionDataList,
    preferWorkspaceVersion = false
  ): Promise<ExtensionDataList> {
    const promises = extensionList.map(async (entry) => {
      if (entry.extensionId) {
        // don't pass `entry.extensionId` (as ComponentID) to `resolveComponentId` because then it'll use the optimization
        // of parsing it to ComponentID without checking the workspace. Normally, this optimization is good, but here
        // in case the extension wasn't exported, the ComponentID is wrong, it has the scope-name due to incorrect ComponentID.fromString
        // in configEntryToDataEntry() function. It'd be ideal to fix it from there but it's not easy.
        const componentId = await this.workspace.resolveComponentId(entry.extensionId.toString());
        const idFromWorkspace = preferWorkspaceVersion ? this.workspace.getIdIfExist(componentId) : undefined;
        const id = idFromWorkspace || componentId;
        entry.extensionId = id;
        entry.newExtensionId = id;
      }

      return entry;
    });
    await Promise.all(promises);
    return extensionList;
  }
}
