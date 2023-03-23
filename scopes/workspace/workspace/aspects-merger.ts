import { Harmony } from '@teambit/harmony';
import { Component, ComponentID } from '@teambit/component';
import { UnmergedComponent } from '@teambit/legacy/dist/scope/lanes/unmerged-components';
import { BitId } from '@teambit/legacy-bit-id';
import { EnvsAspect } from '@teambit/envs';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { partition, mergeWith, merge } from 'lodash';
import { MergeConfigConflict } from './exceptions/merge-config-conflict';
import { AspectSpecificField, ExtensionsOrigin, Workspace } from './workspace';
import { MergeConflictFile } from './merge-conflict-file';

export class AspectsMerger {
  private consumer: Consumer;
  private warnedAboutMisconfiguredEnvs: string[] = []; // cache env-ids that have been errored about not having "env" type
  readonly mergeConflictFile: MergeConflictFile;
  private mergeConfigDepsResolverDataCache: { [compIdStr: string]: Record<string, any> } = {};
  constructor(private workspace: Workspace, private harmony: Harmony) {
    this.consumer = workspace.consumer;
    this.mergeConflictFile = new MergeConflictFile(workspace.path);
  }

  getDepsDataOfMergeConfig(id: BitId) {
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
    let wsDefaultExtensions: ExtensionDataList | undefined;
    const mergeFromScope = true;
    const errors: Error[] = [];

    const bitMapEntry = this.consumer.bitMap.getComponentIfExist(componentId._legacy);
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
    const scopeExtensions = componentFromScope?.config?.extensions || new ExtensionDataList();
    // backward compatibility. previously, it was saved as an array into the model (when there was merge-config)
    this.removeAutoDepsFromConfig(componentId, scopeExtensions, true);
    const [specific, nonSpecific] = partition(scopeExtensions, (entry) => entry.config[AspectSpecificField] === true);
    const scopeExtensionsNonSpecific = new ExtensionDataList(...nonSpecific);
    const scopeExtensionsSpecific = new ExtensionDataList(...specific);

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
      const selfInMergedExtensions = extsWithoutRemoved.findExtension(
        componentId._legacy.toStringWithoutScopeAndVersion(),
        true,
        true
      );
      const extsWithoutSelf = selfInMergedExtensions?.extensionId
        ? extsWithoutRemoved.remove(selfInMergedExtensions.extensionId)
        : extsWithoutRemoved;
      const { extensionDataListFiltered, envIsCurrentlySet } = await this.filterEnvsFromExtensionsIfNeeded(
        extsWithoutSelf,
        envWasFoundPreviously,
        origin
      );
      if (envIsCurrentlySet) {
        await this.warnAboutMisconfiguredEnv(componentId, extensions);
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
    // Do not apply default extensions on the default extensions (it will create infinite loop when loading them)
    const isDefaultExtension = wsDefaultExtensions?.findExtension(componentId.toString(), true, true);
    if (
      wsDefaultExtensions &&
      continuePropagating &&
      !isDefaultExtension &&
      !excludeOrigins.includes('WorkspaceDefault')
    ) {
      await addExtensionsToMerge(wsDefaultExtensions, 'WorkspaceDefault');
    }
    if (mergeFromScope && continuePropagating && !excludeOrigins.includes('ModelNonSpecific')) {
      await addExtensionsToMerge(scopeExtensionsNonSpecific, 'ModelNonSpecific');
    }

    // It's important to do this resolution before the merge, otherwise we have issues with extensions
    // coming from scope with local scope name, as opposed to the same extension comes from the workspace with default scope name
    await Promise.all(extensionsToMerge.map((list) => this.resolveExtensionListIds(list.extensions)));
    const afterMerge = ExtensionDataList.mergeConfigs(extensionsToMerge.map((ext) => ext.extensions));
    await this.loadExtensions(afterMerge, componentId);
    const withoutRemoved = afterMerge.filter((extData) => !removedExtensionIds.includes(extData.stringId));
    const extensions = ExtensionDataList.fromArray(withoutRemoved);
    return {
      extensions,
      beforeMerge: extensionsToMerge,
      errors,
    };
  }

  /**
   * from the merge-config we get the dep-resolver policy as an array, because it needs to support "force" prop.
   * however, when we save the config, we want to save it as an object, so we need split the data into two:
   * 1. force: true, which gets saved into the config.
   * 2. force: false, which gets saved into the data.dependencies later on. see the LegacyDependencyResolver.registerOnComponentAutoDetectOverridesGetter hook
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

  private getUnmergedData(componentId: ComponentID): UnmergedComponent | undefined {
    return this.workspace.scope.legacyScope.objects.unmergedComponents.getEntry(componentId._legacy.name);
  }

  private async warnAboutMisconfiguredEnv(componentId: ComponentID, extensionDataList: ExtensionDataList) {
    if (!(await this.workspace.hasId(componentId))) {
      // if this is a dependency and not belong to the workspace, don't show the warning
      return;
    }
    const envAspect = extensionDataList.findExtension(EnvsAspect.id);
    const envFromEnvsAspect = envAspect?.config.env;
    if (!envFromEnvsAspect) return;
    if (this.workspace.envs.getCoreEnvsIds().includes(envFromEnvsAspect)) return;
    if (this.warnedAboutMisconfiguredEnvs.includes(envFromEnvsAspect)) return;
    let env: Component;
    try {
      const envId = await this.workspace.resolveComponentId(envFromEnvsAspect);
      env = await this.workspace.get(envId);
    } catch (err) {
      return; // unable to get the component for some reason. don't sweat it. forget about the warning
    }
    if (!this.workspace.envs.isUsingEnvEnv(env)) {
      this.warnedAboutMisconfiguredEnvs.push(envFromEnvsAspect);
      this.workspace.logger.consoleWarning(
        `env "${envFromEnvsAspect}" is not of type env. (correct the env's type, or component config with "bit env set ${envFromEnvsAspect} teambit.envs/env")`
      );
    }
  }

  private async filterEnvsFromExtensionsIfNeeded(
    extensionDataList: ExtensionDataList,
    envWasFoundPreviously: boolean,
    origin: ExtensionsOrigin
  ) {
    const envAspect = extensionDataList.findExtension(EnvsAspect.id);
    const envFromEnvsAspect: string | undefined = envAspect?.config.env || envAspect?.data.id;
    const aspectsRegisteredAsEnvs = extensionDataList
      .filter((aspect) => this.workspace.envs.getEnvDefinitionByStringId(aspect.stringId))
      .map((aspect) => aspect.stringId);
    if (envWasFoundPreviously && (envAspect || aspectsRegisteredAsEnvs.length)) {
      const nonEnvs = extensionDataList.filter((e) => {
        // normally the env-id inside the envs aspect doesn't have a version, but the aspect itself has a version.
        if (
          (envFromEnvsAspect && e.stringId === envFromEnvsAspect) ||
          (envFromEnvsAspect && e.extensionId?.toStringWithoutVersion() === envFromEnvsAspect) ||
          aspectsRegisteredAsEnvs.includes(e.stringId)
        ) {
          return false;
        }
        return true;
      });
      // still, aspect env may have other data other then config.env.
      if (envAspect) delete envAspect.config.env;
      return { extensionDataListFiltered: new ExtensionDataList(...nonEnvs), envIsCurrentlySet: true };
    }
    if (envFromEnvsAspect && (origin === 'ModelNonSpecific' || origin === 'ModelSpecific')) {
      // if env was found, search for this env in the workspace and if found, replace the env-id with the one from the workspace
      const envAspectExt = extensionDataList.find((e) => e.extensionId?.toStringWithoutVersion() === envFromEnvsAspect);
      const ids = await this.workspace.listIds();
      const envAspectId = envAspectExt?.extensionId;
      const found = envAspectId && ids.find((id) => id._legacy.isEqualWithoutVersion(envAspectId));
      if (found) {
        envAspectExt.extensionId = found._legacy;
      }
    }
    return { extensionDataListFiltered: extensionDataList, envIsCurrentlySet: Boolean(envFromEnvsAspect) };
  }

  /**
   * Load all unloaded extensions from a list
   * @param extensions list of extensions with config to load
   */
  private async loadExtensions(
    extensions: ExtensionDataList,
    originatedFrom?: ComponentID,
    throwOnError = false
  ): Promise<void> {
    const workspaceAspectsLoader = this.workspace.getWorkspaceAspectsLoader();
    return workspaceAspectsLoader.loadComponentsExtensions(extensions, originatedFrom, throwOnError);
  }

  /**
   * This will mutate the entries with extensionId prop to have resolved legacy id
   * This should be worked on the extension data list not the new aspect list
   * @param extensionList
   */
  private async resolveExtensionListIds(extensionList: ExtensionDataList): Promise<ExtensionDataList> {
    const promises = extensionList.map(async (entry) => {
      if (entry.extensionId) {
        const id = await this.workspace.resolveComponentId(entry.extensionId);
        entry.extensionId = id._legacy;
      }

      return entry;
    });
    await Promise.all(promises);
    return extensionList;
  }
}
