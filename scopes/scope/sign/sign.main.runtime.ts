import mapSeries from 'p-map-series';
import { SlotRegistry, Slot } from '@teambit/harmony';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { Component, ComponentID } from '@teambit/component';
import {
  getPublishedPackages,
  updateComponentsByTagResult,
} from '@teambit/legacy/dist/scope/component-ops/tag-model-component';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { BuildStatus } from '@teambit/legacy/dist/constants';
import { getScopeRemotes } from '@teambit/legacy/dist/scope/scope-remotes';
import { PostSign } from '@teambit/legacy/dist/scope/actions';
import { ObjectList } from '@teambit/legacy/dist/scope/objects/object-list';
import { Remotes } from '@teambit/legacy/dist/remotes';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { SignCmd } from './sign.cmd';
import { SignAspect } from './sign.aspect';

export type SignResult = {
  components: Component[];
  publishedPackages: string[];
  error: string | null;
};

type OnPostSign = (components: Component[]) => Promise<void>;
type OnPostSignSlot = SlotRegistry<OnPostSign>;

export class SignMain {
  constructor(
    private scope: ScopeMain,
    private logger: Logger,
    private builder: BuilderMain,
    private onPostSignSlot: OnPostSignSlot
  ) {}

  async sign(ids: ComponentID[], isMultiple?: boolean, push?: boolean): Promise<SignResult | null> {
    if (isMultiple) await this.scope.import(ids);
    const { componentsToSkip, componentsToSign } = await this.getComponentIdsToSign(ids);
    if (componentsToSkip.length) {
      // eslint-disable-next-line no-console
      console.log(`the following component(s) were already signed successfully:
${componentsToSkip.map((c) => c.toString()).join('\n')}\n`);
    }
    if (!componentsToSign.length) {
      return null;
    }

    const components = await this.scope.getMany(componentsToSign);
    const { builderDataMap, pipeResults } = await this.builder.tagListener(
      components,
      { throwOnError: false },
      { seedersOnly: true, installOptions: { copyPeerToRuntimeOnComponents: true } }
    );
    const legacyBuildResults = this.scope.builderDataMapToLegacyOnTagResults(builderDataMap);
    const legacyComponents = components.map((c) => c.state._consumer);
    updateComponentsByTagResult(legacyComponents, legacyBuildResults);
    const publishedPackages = getPublishedPackages(legacyComponents);
    const pipeWithError = pipeResults.find((pipe) => pipe.hasErrors());
    const buildStatus = pipeWithError ? BuildStatus.Failed : BuildStatus.Succeed;
    if (push) {
      if (isMultiple) {
        await this.exportExtensionsDataIntoScopes(legacyComponents, buildStatus);
      } else {
        await this.saveExtensionsDataIntoScope(legacyComponents, buildStatus);
      }
      await this.clearScopesCaches(legacyComponents);
    }
    await this.triggerOnPostSign(components);

    return {
      components,
      publishedPackages,
      error: pipeWithError ? pipeWithError.getErrorMessageFormatted() : null,
    };
  }

  public registerOnPostSign(fn: OnPostSign) {
    this.onPostSignSlot.register(fn);
  }

  async triggerOnPostSign(components: Component[]) {
    await Promise.all(this.onPostSignSlot.values().map((fn) => fn(components))).catch((err) => {
      this.logger.error('failed running onPostSignSlot', err);
    });
  }

  private async clearScopesCaches(components: ConsumerComponent[]) {
    const bitIds = BitIds.fromArray(components.map((c) => c.id));
    const idsGroupedByScope = bitIds.toGroupByScopeName(new BitIds());
    const scopeRemotes: Remotes = await getScopeRemotes(this.scope.legacyScope);
    await Promise.all(
      Object.keys(idsGroupedByScope).map(async (scopeName) => {
        const remote = await scopeRemotes.resolve(scopeName, this.scope.legacyScope);
        return remote.action(PostSign.name, { ids: idsGroupedByScope[scopeName].map((id) => id.toString()) });
      })
    );
  }

  private async saveExtensionsDataIntoScope(components: ConsumerComponent[], buildStatus: BuildStatus) {
    await mapSeries(components, async (component) => {
      component.buildStatus = buildStatus;
      await this.scope.legacyScope.sources.enrichSource(component);
    });
    await this.scope.legacyScope.objects.persist();
  }

  private async exportExtensionsDataIntoScopes(components: ConsumerComponent[], buildStatus: BuildStatus) {
    const scopeRemotes: Remotes = await getScopeRemotes(this.scope.legacyScope);
    const objectListPerScope: { [scopeName: string]: ObjectList } = {};
    await mapSeries(components, async (component) => {
      component.buildStatus = buildStatus;
      const objects = await this.scope.legacyScope.sources.getObjectsToEnrichSource(component);
      const scopeName = component.scope as string;
      const objectList = await ObjectList.fromBitObjects(objects);
      if (objectListPerScope[scopeName]) {
        objectListPerScope[scopeName].mergeObjectList(objectList);
      } else {
        objectListPerScope[scopeName] = objectList;
      }
    });
    await mapSeries(Object.keys(objectListPerScope), async (scopeName) => {
      const remote = await scopeRemotes.resolve(scopeName, this.scope.legacyScope);
      const objectList = objectListPerScope[scopeName];
      this.logger.setStatusLine(`transferring ${objectList.count()} objects to the remote "${remote.name}"...`);
      await remote.pushMany(objectList, { persist: true });
    });
  }

  private async getComponentIdsToSign(
    ids: ComponentID[]
  ): Promise<{
    componentsToSkip: ComponentID[];
    componentsToSign: ComponentID[];
  }> {
    // using `loadComponents` instead of `getMany` to make sure component aspects are loaded.
    this.logger.setStatusLine(`loading ${ids.length} components and their aspects...`);
    const components = await this.scope.loadMany(ids);
    this.logger.clearStatusLine();
    const componentsToSign: ComponentID[] = [];
    const componentsToSkip: ComponentID[] = [];
    components.forEach((component) => {
      if (component.state._consumer.buildStatus === BuildStatus.Succeed) {
        componentsToSkip.push(component.id);
      } else {
        componentsToSign.push(component.id);
      }
    });
    return { componentsToSkip, componentsToSign };
  }

  static runtime = MainRuntime;

  static dependencies = [CLIAspect, ScopeAspect, LoggerAspect, BuilderAspect];

  static slots = [Slot.withType<OnPostSignSlot>()];

  static async provider(
    [cli, scope, loggerMain, builder]: [CLIMain, ScopeMain, LoggerMain, BuilderMain],
    _,
    [onPostSignSlot]: [OnPostSignSlot]
  ) {
    const logger = loggerMain.createLogger(SignAspect.id);
    const signMain = new SignMain(scope, logger, builder, onPostSignSlot);
    cli.register(new SignCmd(signMain, scope, logger));
    return signMain;
  }
}

SignAspect.addRuntime(SignMain);
