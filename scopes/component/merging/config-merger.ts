import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config/extension-data';
import { ConfigMergeResult } from './config-merge-result';

type GenericConfigOrRemoved = Record<string, any> | '-';
export type MergeStrategyResult = {
  id: string;
  config: GenericConfigOrRemoved | null;
  conflict?: string;
  isMerged?: boolean;
};
type MergeStrategyParams = {
  id: string;
  currentConfig: GenericConfigOrRemoved;
  otherConfig: GenericConfigOrRemoved;
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
    const mergeStrategyParams: MergeStrategyParams = {
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
      const result = strategy(mergeStrategyParams);
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
}: MergeStrategyParams): MergeStrategyResult {
  const conflict = `"${id}":
${'<'.repeat(7)} ${currentLabel}
    ${JSON.stringify(currentConfig, undefined, 2).replaceAll('\n', '\n    ')}
=======
    ${JSON.stringify(otherConfig, undefined, 2).replaceAll('\n', '\n    ')}
${'>'.repeat(7)} ${otherLabel}`;
  return { id, config: { currentConfig, otherConfig }, conflict };
}

function depResolverStrategy({
  id,
  currentConfig,
  otherConfig,
  baseConfig,
}: MergeStrategyParams): MergeStrategyResult | undefined {
  if (id !== DependencyResolverAspect.id) return undefined;
  return undefined;
}
