import { Harmony } from '@teambit/harmony';
import fs from 'fs-extra';
import { Component, ComponentID } from '@teambit/component';
import { UnmergedComponent } from '@teambit/legacy/dist/scope/lanes/unmerged-components';
import { EnvsAspect } from '@teambit/envs';
import { Consumer } from '@teambit/legacy/dist/consumer';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { partition, mergeWith } from 'lodash';
import { MergeConfigConflict } from './exceptions/merge-config-conflict';
import { AspectSpecificField, ExtensionsOrigin, Workspace } from './workspace';

export class AspectsMerger {
  private consumer: Consumer;
  private warnedAboutMisconfiguredEnvs: string[] = []; // cache env-ids that have been errored about not having "env" type
  constructor(private workspace: Workspace, private harmony: Harmony) {
    this.consumer = workspace.consumer;
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

    let configMergeFile: Record<string, any> | undefined;
    try {
      configMergeFile = await this.getConfigMergeFile(componentId);
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
      if (!configMergeFile && !unmergedDataMergeConf) return undefined;
      if (!configMergeFile) return unmergedDataMergeConf;
      if (!unmergedDataMergeConf) return configMergeFile;

      return mergeWith(configMergeFile, unmergedDataMergeConf, (objValue, srcValue) => {
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

    const scopeExtensions = componentFromScope?.config?.extensions || new ExtensionDataList();
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
    if (configMergeExtensions && !excludeOrigins.includes('ConfigMerge')) {
      await addExtensionsToMerge(ExtensionDataList.fromArray(configMergeExtensions), 'ConfigMerge');
    }
    if (bitMapExtensions && !excludeOrigins.includes('BitmapFile')) {
      const extensionDataList = ExtensionDataList.fromConfigObject(bitMapExtensions);
      setDataListAsSpecific(extensionDataList);
      await addExtensionsToMerge(extensionDataList, 'BitmapFile');
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
    if (envWasFoundPreviously && envAspect) {
      const nonEnvs = extensionDataList.filter((e) => {
        // normally the env-id inside the envs aspect doesn't have a version, but the aspect itself has a version.
        if (e.stringId === envFromEnvsAspect || e.extensionId?.toStringWithoutVersion() === envFromEnvsAspect)
          return false;
        return true;
      });
      // still, aspect env may have other data other then config.env.
      delete envAspect.config.env;
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

  private async getConfigMergeFile(componentId: ComponentID): Promise<Record<string, any> | undefined> {
    const configMergePath = this.workspace.getConfigMergeFilePath(componentId);
    let fileContent: string;
    try {
      fileContent = await fs.readFile(configMergePath, 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return undefined;
      }
      throw err;
    }
    try {
      return JSON.parse(fileContent);
    } catch (err: any) {
      throw new MergeConfigConflict(configMergePath);
    }
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
