import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Component, InvalidComponent } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { Logger } from '@teambit/logger';
import type { ComponentLoadOptions, WorkspaceComponentLoader } from '../workspace-component-loader';
import { diffResultSets, isResultDiffEmpty } from './diff';
import type { ResultDiff } from './diff';
import { serializeComponentForDiff } from './snapshot';

type GetManyRes = {
  components: Component[];
  invalidComponents: InvalidComponent[];
};

export type LoaderFactory = () => WorkspaceComponentLoader;

export interface LoaderDiffHarnessOptions {
  /**
   * Sample rate. `1` runs the partner on every loader call. `N > 1` runs it
   * every Nth call — use this on large workspaces where running both loaders
   * for every call would OOM Node's default heap.
   */
  sampleEvery: number;
  /**
   * Override the default output path. Used by e2e tests that need isolated
   * logs per test. Not user-facing.
   */
  outputPath?: string;
}

/**
 * Wraps a primary loader and a partner loader, runs both on every (sampled) call,
 * and writes any diffs to a JSONL log. The primary's result is returned —
 * the partner is observation-only.
 *
 * The partner is constructed lazily on first use and reused across calls,
 * so its cache state mirrors how it would behave in real usage. Slot side
 * effects fire twice when the harness is enabled — this is a development
 * tool, not a production wrapper.
 */
export class LoaderDiffHarness {
  private partner: WorkspaceComponentLoader | null = null;
  private readonly outputPath: string;
  private readonly sampleEvery: number;
  private callIndex = 0;
  private writeFailureLogged = false;

  constructor(
    private primary: WorkspaceComponentLoader,
    private partnerFactory: LoaderFactory,
    private logger: Logger,
    options: LoaderDiffHarnessOptions
  ) {
    this.outputPath = options.outputPath ?? path.join(os.tmpdir(), `bit-loader-diff-${process.pid}.jsonl`);
    this.sampleEvery = Math.max(1, Math.floor(options.sampleEvery));
    this.writeHeader();
    // eslint-disable-next-line no-console
    console.error(`[loader-diff] sample 1/${this.sampleEvery} → ${this.outputPath}`);
  }

  async getMany(ids: ComponentID[], loadOpts?: ComponentLoadOptions, throwOnFailure = true): Promise<GetManyRes> {
    const primaryResult = await this.primary.getMany(ids, loadOpts, throwOnFailure);
    await this.observe('getMany', ids, primaryResult.components, () =>
      this.getPartner()
        .getMany(ids, loadOpts, false)
        .then((r) => r.components)
    );
    return primaryResult;
  }

  async get(
    componentId: ComponentID,
    legacyComponent?: ConsumerComponent,
    useCache?: boolean,
    storeInCache?: boolean,
    loadOpts?: ComponentLoadOptions
  ): Promise<Component> {
    const primaryResult = await this.primary.get(componentId, legacyComponent, useCache, storeInCache, loadOpts);
    await this.observe('get', [componentId], [primaryResult], async () => {
      // Don't pass legacyComponent — partner should resolve fresh; passing the same
      // ConsumerComponent would couple the two loaders and hide divergence.
      const partnerResult = await this.getPartner().get(componentId, undefined, useCache, storeInCache, loadOpts);
      return [partnerResult];
    });
    return primaryResult;
  }

  async getIfExist(componentId: ComponentID): Promise<Component | undefined> {
    const primaryResult = await this.primary.getIfExist(componentId);
    await this.observe('getIfExist', [componentId], primaryResult ? [primaryResult] : [], async () => {
      const partnerResult = await this.getPartner().getIfExist(componentId);
      return partnerResult ? [partnerResult] : [];
    });
    return primaryResult;
  }

  async getInvalid(ids: ComponentID[]): Promise<InvalidComponent[]> {
    return this.primary.getInvalid(ids);
  }

  clearCache(): void {
    this.primary.clearCache();
    this.partner?.clearCache();
  }

  clearComponentCache(id: ComponentID): void {
    this.primary.clearComponentCache(id);
    this.partner?.clearComponentCache(id);
  }

  private getPartner(): WorkspaceComponentLoader {
    if (!this.partner) {
      this.partner = this.partnerFactory();
    }
    return this.partner;
  }

  private async observe(
    operation: string,
    ids: ComponentID[],
    primaryComponents: Component[],
    runPartner: () => Promise<Component[]>
  ): Promise<void> {
    const callId = this.callIndex++;
    if (callId % this.sampleEvery !== 0) return;
    let partnerComponents: Component[];
    try {
      partnerComponents = await runPartner();
    } catch (err: any) {
      this.writeLine({
        callId,
        operation,
        ids: ids.map((i) => i.toString()),
        partnerError: err?.message ?? String(err),
      });
      return;
    }

    const primarySnapshots = primaryComponents.map(serializeComponentForDiff);
    const partnerSnapshots = partnerComponents.map(serializeComponentForDiff);
    const diff = diffResultSets(primarySnapshots, partnerSnapshots);
    if (isResultDiffEmpty(diff)) return;

    this.writeLine({
      callId,
      operation,
      ids: ids.map((i) => i.toString()),
      diff: summarizeDiff(diff),
    });
  }

  private writeHeader(): void {
    this.writeLine({
      header: true,
      sampleEvery: this.sampleEvery,
      startedAt: new Date().toISOString(),
      pid: process.pid,
      cwd: process.cwd(),
    });
  }

  private writeLine(record: object): void {
    try {
      fs.appendFileSync(this.outputPath, `${JSON.stringify(record)}\n`);
    } catch (err: any) {
      if (this.writeFailureLogged) return;
      this.writeFailureLogged = true;
      this.logger.warn(`[loader-diff] failed to write to ${this.outputPath}: ${err?.message ?? err}`);
    }
  }
}

function summarizeDiff(diff: ResultDiff): object {
  return {
    missingFromPartner: diff.missingFromPartner.map((s) => s.id),
    missingFromPrimary: diff.missingFromPrimary.map((s) => s.id),
    componentDiffs: diff.componentDiffs,
  };
}
