import mapSeries from 'p-map-series';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { Component, ComponentID } from '@teambit/component';
import {
  getPublishedPackages,
  updateComponentsByTagResult,
} from 'bit-bin/dist/scope/component-ops/tag-model-component';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import { BuildStatus } from 'bit-bin/dist/constants';
import { getScopeRemotes } from 'bit-bin/dist/scope/scope-remotes';
import { PostSign } from 'bit-bin/dist/scope/actions';
import { Remotes } from 'bit-bin/dist/remotes';
import { BitIds } from 'bit-bin/dist/bit-id';
import { SignCmd } from './sign.cmd';
import { SignAspect } from './sign.aspect';

export type SignResult = { components: Component[]; publishedPackages: string[]; error: string | null };

export class SignMain {
  constructor(private scope: ScopeMain, private logger: Logger, private builder: BuilderMain) {}

  async sign(ids: ComponentID[]): Promise<SignResult> {
    const components = await this.scope.getMany(ids);
    const { aspectListMap, pipeResults } = await this.builder.tagListener(components, { throwOnError: false });
    const legacyBuildResults = this.scope.aspectMapToLegacyOnTagResults(aspectListMap);
    const legacyComponents = components.map((c) => c.state._consumer);
    updateComponentsByTagResult(legacyComponents, legacyBuildResults);
    const publishedPackages = getPublishedPackages(legacyComponents);
    const pipeWithError = pipeResults.find((pipe) => pipe.hasErrors());
    const buildStatus = pipeWithError ? BuildStatus.Failed : BuildStatus.Succeed;
    await this.saveExtensionsDataIntoScope(legacyComponents, buildStatus);
    await this.clearScopesCaches(legacyComponents);
    return {
      components,
      publishedPackages,
      error: pipeWithError ? pipeWithError.getErrorMessageFormatted() : null,
    };
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

  static runtime = MainRuntime;

  static dependencies = [CLIAspect, ScopeAspect, LoggerAspect, BuilderAspect];

  static async provider([cli, scope, loggerMain, builder]: [CLIMain, ScopeMain, LoggerMain, BuilderMain]) {
    const logger = loggerMain.createLogger(SignAspect.id);
    const signMain = new SignMain(scope, logger, builder);
    cli.register(new SignCmd(signMain, scope, logger));
    return signMain;
  }
}

SignAspect.addRuntime(SignMain);
