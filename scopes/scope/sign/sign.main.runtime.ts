import mapSeries from 'p-map-series';
import { SlotRegistry, Slot } from '@teambit/harmony';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { Component, ComponentID } from '@teambit/component';
import { SnappingAspect, SnappingMain } from '@teambit/snapping';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { BuildStatus, CENTRAL_BIT_HUB_URL, CENTRAL_BIT_HUB_NAME } from '@teambit/legacy/dist/constants';
import { getScopeRemotes } from '@teambit/legacy/dist/scope/scope-remotes';
import { PostSign } from '@teambit/legacy/dist/scope/actions';
import { ObjectList } from '@teambit/legacy/dist/scope/objects/object-list';
import { Remotes } from '@teambit/legacy/dist/remotes';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { Http } from '@teambit/legacy/dist/scope/network/http';
import LanesAspect, { LanesMain } from '@teambit/lanes';
import { LaneId } from '@teambit/lane-id';
import { Lane } from '@teambit/legacy/dist/scope/models';
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
    private onPostSignSlot: OnPostSignSlot,
    private lanes: LanesMain,
    private snapping: SnappingMain
  ) {}

  /**
   * complete the build process of a component.
   * `isMultiple` indicates that this is running on a new bare-scope and not on the original scope.
   * it's recommended to always use it, even when it's a single component and not multiple.
   * (the reason for this name is that for multiple components from multiple scopes, it must be done on a new bare-scope).
   *
   * important! this method mutates the legacyScope. it assigns the currentLaneId according to the `bit sign --lane` flag.
   * if for some reason you're using this API in a long-running-process, make sure to revert it.
   */
  async sign(ids: ComponentID[], isMultiple?: boolean, push?: boolean, laneIdStr?: string): Promise<SignResult | null> {
    let lane: Lane | undefined;
    if (isMultiple) {
      const longProcessLogger = this.logger.createLongProcessLogger('import objects');
      if (laneIdStr) {
        const laneId = LaneId.parse(laneIdStr);
        lane = await this.lanes.importLaneObject(laneId);
        // this is critical. otherwise, later on, when loading aspects and isolating capsules, we'll try to fetch dists
        // from the original scope instead of the lane-scope.
        this.scope.legacyScope.setCurrentLaneId(laneId);
      }
      await this.scope.import(ids, { lane });
      longProcessLogger.end();
      this.logger.consoleSuccess();
    }
    const { componentsToSkip, componentsToSign } = await this.getComponentIdsToSign(ids);
    if (ids.length && componentsToSkip.length) {
      // eslint-disable-next-line no-console
      console.log(`the following component(s) were already signed successfully:
${componentsToSkip.map((c) => c.toString()).join('\n')}\n`);
    }
    if (!componentsToSign.length) {
      return null;
    }

    // using `loadMany` instead of `getMany` to make sure component aspects are loaded.
    this.logger.setStatusLine(`loading ${componentsToSign.length} components and their aspects...`);
    const components = await this.scope.loadMany(componentsToSign);
    this.logger.clearStatusLine();
    const { builderDataMap, pipeResults } = await this.builder.tagListener(
      components,
      { throwOnError: false },
      { seedersOnly: true, installOptions: { copyPeerToRuntimeOnComponents: true, installPeersFromEnvs: true } }
    );
    const legacyBuildResults = this.scope.builderDataMapToLegacyOnTagResults(builderDataMap);
    const legacyComponents = components.map((c) => c.state._consumer);
    this.snapping._updateComponentsByTagResult(legacyComponents, legacyBuildResults);
    const publishedPackages = this.snapping._getPublishedPackages(legacyComponents);
    const pipeWithError = pipeResults.find((pipe) => pipe.hasErrors());
    const buildStatus = pipeWithError ? BuildStatus.Failed : BuildStatus.Succeed;
    if (push) {
      if (isMultiple) {
        await this.exportExtensionsDataIntoScopes(legacyComponents, buildStatus, lane);
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
      await this.snapping._enrichComp(component);
    });
    await this.scope.legacyScope.objects.persist();
  }

  private async exportExtensionsDataIntoScopes(components: ConsumerComponent[], buildStatus: BuildStatus, lane?: Lane) {
    const objectList = new ObjectList();
    const signComponents = await mapSeries(components, async (component) => {
      component.buildStatus = buildStatus;
      const objects = await this.snapping._getObjectsToEnrichComp(component);
      const scopeName = component.scope as string;
      const objectToMerge = await ObjectList.fromBitObjects(objects);
      objectToMerge.addScopeName(scopeName);
      objectList.mergeObjectList(objectToMerge);
      return ComponentID.fromLegacy(component.id);
    });
    if (lane) {
      // the components should be exported to the lane-scope, not to their original scope.
      objectList.addScopeName(lane.scope);
    }
    const http = await Http.connect(CENTRAL_BIT_HUB_URL, CENTRAL_BIT_HUB_NAME);
    await http.pushToCentralHub(objectList, {
      persist: true,
      sign: true,
      signComponents: signComponents.map((id) => id.toString()),
    });
  }

  private async getComponentIdsToSign(ids: ComponentID[]): Promise<{
    componentsToSkip: ComponentID[];
    componentsToSign: ComponentID[];
  }> {
    if (!ids.length) {
      ids = await this.scope.listIds();
    }
    this.logger.setStatusLine(`loading ${ids.length} components to determine whether they need to be signed...`);
    const components = await this.scope.getMany(ids);
    this.logger.clearStatusLine();
    const componentsToSign: ComponentID[] = [];
    const componentsToSkip: ComponentID[] = [];
    components.forEach((component) => {
      if (component.state._consumer.buildStatus === BuildStatus.Succeed) {
        componentsToSign.push(component.id);
      } else {
        componentsToSign.push(component.id);
      }
    });
    return { componentsToSkip, componentsToSign };
  }

  static runtime = MainRuntime;

  static dependencies = [CLIAspect, ScopeAspect, LoggerAspect, BuilderAspect, LanesAspect, SnappingAspect];

  static slots = [Slot.withType<OnPostSignSlot>()];

  static async provider(
    [cli, scope, loggerMain, builder, lanes, snapping]: [
      CLIMain,
      ScopeMain,
      LoggerMain,
      BuilderMain,
      LanesMain,
      SnappingMain
    ],
    _,
    [onPostSignSlot]: [OnPostSignSlot]
  ) {
    const logger = loggerMain.createLogger(SignAspect.id);
    const signMain = new SignMain(scope, logger, builder, onPostSignSlot, lanes, snapping);
    cli.register(new SignCmd(signMain));
    return signMain;
  }
}

SignAspect.addRuntime(SignMain);
