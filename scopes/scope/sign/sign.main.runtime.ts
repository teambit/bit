import mapSeries from 'p-map-series';
import { SlotRegistry, Slot, Harmony } from '@teambit/harmony';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { isSnap } from '@teambit/component-version';
import { Component, ComponentID } from '@teambit/component';
import { SnappingAspect, SnappingMain } from '@teambit/snapping';
import { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { getBasicLog } from '@teambit/harmony.modules.get-basic-log';
import { BuildStatus, CENTRAL_BIT_HUB_URL, CENTRAL_BIT_HUB_NAME } from '@teambit/legacy/dist/constants';
import { getScopeRemotes } from '@teambit/legacy/dist/scope/scope-remotes';
import { PostSign } from '@teambit/legacy/dist/scope/actions';
import { ObjectList } from '@teambit/legacy/dist/scope/objects/object-list';
import { Remote, Remotes } from '@teambit/legacy/dist/remotes';
import { ComponentIdList } from '@teambit/component-id';
import Version, { Log } from '@teambit/legacy/dist/scope/models/version';
import { Http } from '@teambit/legacy/dist/scope/network/http';
import { LanesAspect, LanesMain } from '@teambit/lanes';
import { BitError } from '@teambit/bit-error';
import { LaneId } from '@teambit/lane-id';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { SignCmd, SignOptions } from './sign.cmd';
import { SignAspect } from './sign.aspect';
import { ExportAspect, ExportMain } from '@teambit/export';

type ObjectsPerRemote = {
  remote: Remote;
  objectList: ObjectList;
  exportedIds?: string[];
};

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
    private snapping: SnappingMain,
    private harmony: Harmony,
    private exporter: ExportMain
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
  async sign(
    ids: ComponentID[],
    laneIdStr?: string,
    { originalScope, push, rebuild, saveLocally, reuseCapsules, tasks }: SignOptions = {}
  ): Promise<SignResult | null> {
    this.throwIfOnWorkspace();
    if (push && rebuild) {
      throw new BitError('you can not use --push and --rebuild together');
    }
    if (saveLocally && push && originalScope) {
      throw new BitError('no need to use --save-locally when pushing to the original scope, it is done automatically');
    }
    let lane: Lane | undefined;
    if (!originalScope) {
      const longProcessLogger = this.logger.createLongProcessLogger('import objects');
      if (laneIdStr) {
        const laneId = LaneId.parse(laneIdStr);
        lane = await this.lanes.importLaneObject(laneId);
        // this is critical. otherwise, later on, when loading aspects and isolating capsules, we'll try to fetch dists
        // from the original scope instead of the lane-scope.
        this.scope.legacyScope.setCurrentLaneId(laneId);
        this.scope.legacyScope.scopeImporter.shouldOnlyFetchFromCurrentLane = true;
      }
      await this.scope.import(ids, {
        lane,
        includeUpdateDependents: true,
        reason: 'which are the seeders for the sign process',
      });
      longProcessLogger.end('success');
    }
    const { componentsToSkip, componentsToSign } = await this.getComponentIdsToSign(ids, rebuild);
    if (ids.length && componentsToSkip.length) {
      this.logger.console(`the following component(s) were already signed successfully or marked as skipped:
${componentsToSkip.map((c) => c.toString()).join('\n')}\n`);
    }
    if (!componentsToSign.length) {
      return null;
    }

    // using `loadMany` instead of `getMany` to make sure component aspects are loaded.
    this.logger.setStatusLine(`loading ${componentsToSign.length} components and their aspects...`);
    const components = await this.scope.loadMany(componentsToSign, lane, {
      loadApps: false,
      loadEnvs: true,
      loadCustomEnvs: true,
    });
    this.logger.clearStatusLine();
    // it's enough to check the first component whether it's a snap or tag, because it can't be a mix of both
    const shouldRunSnapPipeline = isSnap(components[0].id.version);
    await Promise.all(
      components.map((component) => this.scope.legacyScope.loadDependenciesGraphForComponent(component.state._consumer))
    );
    const { builderDataMap, pipeResults } = await this.builder.tagListener(
      components,
      { throwOnError: false, isSnap: shouldRunSnapPipeline },
      {
        seedersOnly: true,
        getExistingAsIs: reuseCapsules,
        emptyRootDir: !reuseCapsules,
        installOptions: { copyPeerToRuntimeOnComponents: true, installPeersFromEnvs: true },
      },
      {
        tasks: tasks ? tasks.split(',').map((task) => task.trim()) : [],
      }
    );
    const legacyBuildResults = this.scope.builderDataMapToLegacyOnTagResults(builderDataMap);
    const legacyComponents = components.map((c) => c.state._consumer);
    this.snapping._updateComponentsByTagResult(legacyComponents, legacyBuildResults);
    const publishedPackages = Array.from(this.snapping._getPublishedPackages(legacyComponents).keys());
    const pipeWithError = pipeResults.find((pipe) => pipe.hasErrors());
    const buildStatus = pipeWithError ? BuildStatus.Failed : BuildStatus.Succeed;
    if (push) {
      if (originalScope) {
        await this.saveExtensionsDataIntoScope(legacyComponents, buildStatus);
        await this.clearScopesCaches(legacyComponents);
      } else {
        await this.exportExtensionsDataIntoScopes(legacyComponents, buildStatus, lane);
      }
    }
    if (saveLocally) {
      await this.saveExtensionsDataIntoScope(legacyComponents, buildStatus);
    }
    await this.triggerOnPostSign(components);

    return {
      components,
      publishedPackages,
      error: pipeWithError ? pipeWithError.getErrorMessageFormatted() : null,
    };
  }

  /**
   * this command intended to be used from a bare-scope, where it imports the components to be signed and sign them.
   * if running from the workspace, it can lead to unexpected results. for example, the lane object is imported without
   * its components, which fails "bit lane list" with a ComponentNotFound error.
   */
  private throwIfOnWorkspace() {
    if (this.isOnWorkspace()) {
      throw new Error(
        'sign command is not available from a workspace, please create a new bare-scope and run it from there'
      );
    }
  }

  private isOnWorkspace(): boolean {
    try {
      this.harmony.get('teambit.workspace/workspace');
      return true;
    } catch (err: any) {
      return false;
    }
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
    const bitIds = ComponentIdList.fromArray(components.map((c) => c.id));
    const idsGroupedByScope = bitIds.toGroupByScopeName();
    const scopeRemotes: Remotes = await getScopeRemotes(this.scope.legacyScope);
    await Promise.all(
      Object.keys(idsGroupedByScope).map(async (scopeName) => {
        const remote = await scopeRemotes.resolve(scopeName, this.scope.legacyScope);
        return remote.action(PostSign.name, { ids: idsGroupedByScope[scopeName].map((id) => id.toString()) });
      })
    );
  }

  private async saveExtensionsDataIntoScope(components: ConsumerComponent[], buildStatus: BuildStatus) {
    const modifiedLog = await this.getModifiedLog(buildStatus);
    await mapSeries(components, async (component) => {
      component.buildStatus = buildStatus;
      await this.snapping._enrichComp(component, modifiedLog);
    });
    await this.scope.legacyScope.objects.persist();
  }

  private async getModifiedLog(buildStatus: BuildStatus): Promise<Log> {
    const log = await getBasicLog();
    return { ...log, message: `sign. buildStatus: ${buildStatus}` };
  }

  private async exportExtensionsDataIntoScopes(components: ConsumerComponent[], buildStatus: BuildStatus, lane?: Lane) {
    const objectList = new ObjectList();
    const modifiedLog = await this.getModifiedLog(buildStatus);
    const idsHashMaps = {};
    const signComponents = await mapSeries(components, async (component) => {
      component.buildStatus = buildStatus;
      const objects = await this.snapping._getObjectsToEnrichComp(component, modifiedLog);
      const versionHash = objects
        .find((obj) => obj instanceof Version)
        ?.hash()
        .toString();
      if (!versionHash) throw new Error(`Version object is missing for ${component.id.toString()}`);
      idsHashMaps[versionHash] = component.id.toString();
      const scopeName = component.scope as string;
      const objectToMerge = await ObjectList.fromBitObjects(objects);
      objectToMerge.addScopeName(scopeName);
      objectList.mergeObjectList(objectToMerge);
      return component.id;
    });
    if (lane) {
      // the components should be exported to the lane-scope, not to their original scope.
      objectList.addScopeName(lane.scope);
    }

    const scopeRemotes = await getScopeRemotes(this.scope.legacyScope);
    const objectsPerRemote = objectList.objects.reduce((acc, current) => {
      const scope: string = current.scope as string;
      if (acc[scope]) acc[scope].push(current);
      else acc[scope] = [current];
      return acc;
    }, {});
    const manyObjectsPerRemote: ObjectsPerRemote[] = await Promise.all(
      Object.keys(objectsPerRemote).map(async (scopeName) => {
        const remote = await scopeRemotes.resolve(scopeName, this.scope.legacyScope);
        return { remote, objectList: new ObjectList(objectsPerRemote[scopeName]) };
      })
    );
    const shouldPushToCentralHub = this.exporter.shouldPushToCentralHub(manyObjectsPerRemote, scopeRemotes);

    const http = await Http.connect(CENTRAL_BIT_HUB_URL, CENTRAL_BIT_HUB_NAME);
    if (shouldPushToCentralHub) {
      await http.pushToCentralHub(objectList, {
        origin: 'sign',
        sign: true,
        signComponents: signComponents.map((id) => id.toString()),
        idsHashMaps,
      });
    } else {
      await this.exporter.pushToRemotesCarefully(manyObjectsPerRemote);
    }
  }

  private async getComponentIdsToSign(
    ids: ComponentID[],
    rebuild?: boolean
  ): Promise<{
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
      if (component.state._consumer.buildStatus === BuildStatus.Skipped) {
        componentsToSkip.push(component.id);
      } else if (component.state._consumer.buildStatus === BuildStatus.Succeed) {
        rebuild ? componentsToSign.push(component.id) : componentsToSkip.push(component.id);
      } else {
        componentsToSign.push(component.id);
      }
    });
    return { componentsToSkip, componentsToSign };
  }

  static runtime = MainRuntime;

  static dependencies = [
    CLIAspect,
    ScopeAspect,
    LoggerAspect,
    BuilderAspect,
    LanesAspect,
    SnappingAspect,
    ExportAspect,
  ];

  static slots = [Slot.withType<OnPostSignSlot>()];

  static async provider(
    [cli, scope, loggerMain, builder, lanes, snapping, exporter]: [
      CLIMain,
      ScopeMain,
      LoggerMain,
      BuilderMain,
      LanesMain,
      SnappingMain,
      ExportMain,
    ],
    _,
    [onPostSignSlot]: [OnPostSignSlot],
    harmony
  ) {
    const logger = loggerMain.createLogger(SignAspect.id);
    const signMain = new SignMain(scope, logger, builder, onPostSignSlot, lanes, snapping, harmony, exporter);
    cli.register(new SignCmd(signMain, logger));
    return signMain;
  }
}

SignAspect.addRuntime(SignMain);
