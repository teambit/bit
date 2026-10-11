import type { Logger } from '@teambit/logger';
import type { Remote } from '@teambit/scope.remotes';
import type { ObjectList } from '@teambit/objects';

type ExportRemote = { remote: Remote; objectList?: ObjectList; exportedIds?: string[] };

type Directive = {
  kind: 'push' | 'validate' | 'persist' | 'cleanup' | 'done' | 'failed';
  indices: number[];
  attempt?: number;
  reason?: 'push' | 'validate' | 'persist';
};
type Reply = { token: string; revision: number; directive: Directive };
type Effect = { success: true } | { success: false; error: any; message?: string };
type Cursor = {
  phase: Directive['kind'];
  index: number;
  attempt: number;
  pushed: Remote[];
  error?: any;
  message?: string;
  reason?: Directive['reason'];
};
type Owner = { prototype: object; push: PropertyDescriptor; logger: string };
// Registrations run in the defining modules, before public extension callbacks.
// eslint-disable-next-line no-var
var owner: Owner | undefined;
// eslint-disable-next-line no-var
var functions: { owner: object; descriptors: PropertyDescriptorMap } | undefined;
const iterator = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
const map = Object.getOwnPropertyDescriptor(Array.prototype, 'map');
const all = Object.getOwnPropertyDescriptor(Promise, 'all');
const pushDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'push');
const every = Object.getOwnPropertyDescriptor(Array.prototype, 'every');
function same(a?: PropertyDescriptor, b?: PropertyDescriptor): boolean {
  return Boolean(
    a &&
      b &&
      a.value === b.value &&
      a.get === b.get &&
      a.set === b.set &&
      a.writable === b.writable &&
      a.enumerable === b.enumerable &&
      a.configurable === b.configurable
  );
}
export function registerRustExportTransactionOwner(constructor: any): void {
  owner ||= {
    prototype: constructor.prototype,
    push: Object.getOwnPropertyDescriptor(constructor.prototype, 'pushRemotesPendingDir')!,
    logger: 'logger',
  };
}
export function hasRustExportTransactionOwner(value: object): boolean {
  return Boolean(
    owner &&
      Object.getPrototypeOf(value) === owner.prototype &&
      !Object.getOwnPropertyDescriptor(value, 'pushRemotesPendingDir') &&
      same(Object.getOwnPropertyDescriptor(owner.prototype, 'pushRemotesPendingDir'), owner.push) &&
      'value' in (Object.getOwnPropertyDescriptor(value, owner.logger) || {})
  );
}
export function registerRustExportTransactionFunctions(value: object): void {
  if (functions) return;
  functions = {
    owner: value,
    descriptors: Object.fromEntries(
      ['validateRemotes', 'persistRemotes', 'removePendingDirs'].map((name) => [
        name,
        Object.getOwnPropertyDescriptor(value, name)!,
      ])
    ),
  };
}
function defaultFunctions(): boolean {
  return Boolean(
    functions &&
      Object.entries(functions.descriptors).every(([name, descriptor]) =>
        same(Object.getOwnPropertyDescriptor(functions!.owner, name), descriptor)
      ) &&
      same(Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator), iterator) &&
      same(Object.getOwnPropertyDescriptor(Array.prototype, 'map'), map) &&
      same(Object.getOwnPropertyDescriptor(Array.prototype, 'push'), pushDescriptor) &&
      same(Object.getOwnPropertyDescriptor(Array.prototype, 'every'), every) &&
      same(Object.getOwnPropertyDescriptor(Promise, 'all'), all)
  );
}
function describe(items: ExportRemote[]): Array<{ item: ExportRemote; remote: Remote; name: string }> | undefined {
  if (!Array.isArray(items) || Object.getPrototypeOf(items) !== Array.prototype || items.length > 4096)
    return undefined;
  const properties = Object.getOwnPropertyDescriptors(items);
  if (Reflect.ownKeys(properties).length !== items.length + 1) return undefined;
  const result: Array<{ item: ExportRemote; remote: Remote; name: string }> = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = properties[index]?.value;
    if (!item || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) return undefined;
    const remote = Object.getOwnPropertyDescriptor(item, 'remote')?.value;
    const name = remote && Object.getOwnPropertyDescriptor(remote, 'name')?.value;
    if (typeof name !== 'string' || !name.length) return undefined;
    result.push({ item, remote, name });
  }
  return result;
}
function matches(reply: any, revision: number, count: number, token?: string): reply is Reply {
  if (!reply || !/^[a-f0-9]{40}$/.test(reply.token) || (token && reply.token !== token) || reply.revision !== revision)
    return false;
  const directive = reply.directive;
  if (
    !directive ||
    !['push', 'validate', 'persist', 'cleanup', 'done', 'failed'].includes(directive.kind) ||
    !Array.isArray(directive.indices) ||
    directive.indices.length > count ||
    !directive.indices.every((index: any) => Number.isInteger(index) && index >= 0 && index < count) ||
    new Set(directive.indices).size !== directive.indices.length
  )
    return false;
  if (directive.kind === 'persist') return directive.indices.length === 1 && [1, 2, 3].includes(directive.attempt);
  if (directive.attempt !== undefined) return false;
  if (directive.kind === 'push') return directive.indices.length === 1;
  if (directive.kind === 'done' || directive.kind === 'failed') return directive.indices.length === 0;
  return true;
}
function agrees(directive: Directive, cursor: Cursor, count: number): boolean {
  if (directive.kind !== cursor.phase) return false;
  if (cursor.phase === 'push' || cursor.phase === 'persist')
    return (
      directive.indices.length === 1 &&
      directive.indices[0] === cursor.index &&
      (cursor.phase !== 'persist' || directive.attempt === cursor.attempt)
    );
  if (cursor.phase === 'validate')
    return directive.indices.length === count && directive.indices.every((index, position) => index === position);
  if (cursor.phase === 'cleanup') {
    const expected = cursor.reason === 'push' ? cursor.pushed.length : count;
    return (
      directive.reason === cursor.reason &&
      directive.indices.length === expected &&
      directive.indices.every((index, position) => index === position)
    );
  }
  return true;
}

/** Receipts stay in Node before a helper request, so helper loss cannot replay remote effects. */
export async function tryRustExportTransaction(
  items: ExportRemote[],
  clientId: string,
  resuming: boolean,
  pushLogger?: Logger,
  resumeSkipDiagnostic = false,
  stillOwner: () => boolean = () => true
): Promise<boolean> {
  const { isRustSnapshotOperation, requestRustTransfer } = require('@teambit/objects');
  if (!isRustSnapshotOperation()) return false;
  // Runtime imports are lazy; register defining-module defaults before checking them.
  const canonical = require('./export-scope-components');
  if (!defaultFunctions() || functions?.owner !== canonical) return false;
  const described = describe(items);
  if (!described || typeof clientId !== 'string' || !clientId.length || (!resuming && !pushLogger)) return false;
  const snapshot = described;
  const eligible = () => {
    const current = describe(items);
    return (
      defaultFunctions() &&
      stillOwner() &&
      current?.length === snapshot.length &&
      current.every(
        (entry, index) =>
          entry.item === snapshot[index].item &&
          entry.remote === snapshot[index].remote &&
          entry.name === snapshot[index].name
      )
    );
  };
  let reply: Reply | undefined = await requestRustTransfer(
    { kind: 'transferTransactionInitialize', scopes: snapshot.map(({ name }) => name), clientId, resuming },
    (data: any) => matches(data, 0, snapshot.length) && eligible()
  );
  if (!reply) return false;
  // The callbacks below retain their original diagnostic/error positions.
  const { logger } = require('@teambit/legacy.logger');
  const { loader } = require('@teambit/legacy.loader');
  const { ExportValidate, ExportPersist } = require('@teambit/scope.remote-actions');
  const { PersistFailed } = require('@teambit/legacy.scope');
  const remotes = snapshot.map(({ remote }) => remote);
  const pushOptions = { clientId };
  const cursor: Cursor = { phase: resuming ? 'validate' : 'push', index: 0, attempt: 1, pushed: [] };
  if (!snapshot.length) cursor.phase = 'validate';
  if (resuming && resumeSkipDiagnostic)
    pushLogger?.debug('pushRemotesPendingDir - skip as the resumeExportId was passed');
  async function push(index: number): Promise<Effect> {
    const { remote, objectList } = await items[index];
    pushLogger!.setStatusLine(`transferring ${objectList!.count()} objects to the remote "${remote.name}"...`);
    try {
      await remote.pushMany(objectList!, pushOptions, {});
      pushLogger!.debug(
        'pushRemotesPendingDir, successfully pushed all objects to the pending-dir directory on the remote'
      );
      cursor.pushed.push(remote);
      return { success: true };
    } catch (error: any) {
      pushLogger!.warn('exportMany, failed pushing objects to the remote');
      return { success: false, error };
    }
  }
  async function validate(indices: number[]): Promise<Effect> {
    loader.start('verifying that objects can be merged on the remotes...');
    try {
      await Promise.all(
        indices.map((index) => remotes[index].action(ExportValidate.name, { clientId, isResumingExport: true }))
      );
      return { success: true };
    } catch (error: any) {
      logger.errorAndAddBreadCrumb('validateRemotes', 'failed validating remotes', {}, error);
      return { success: false, error };
    }
  }
  let activePersist: { item: ExportRemote; remote: Remote } | undefined;
  async function persist(index: number, attempt: number): Promise<Effect> {
    if (attempt === 1) {
      const item = await items[index];
      activePersist = { item, remote: item.remote };
    }
    const { item, remote } = activePersist!;
    if (attempt === 1) loader.start(`persisting data on the remote "${remote.name}"...`);
    try {
      item.exportedIds = await remote.action(ExportPersist.name, { clientId });
    } catch (error: any) {
      const message = error.message;
      logger.errorAndAddBreadCrumb(
        'persistRemotes',
        `failed on remote ${remote.name}, attempt ${attempt} out of 3`,
        {},
        error
      );
      return { success: false, error, message };
    }
    logger.debugAndAddBreadCrumb('persistRemotes', `successfully pushed all ids to the bare-scope ${remote.name}`);
    return { success: true };
  }
  function record(effect: Effect): void {
    if (!effect.success) {
      cursor.error = effect.error;
      cursor.message = effect.message;
      cursor.reason = cursor.phase as Directive['reason'];
      if (cursor.phase === 'persist' && cursor.attempt < 3) cursor.attempt += 1;
      else
        cursor.phase = cursor.phase === 'persist' || (cursor.phase === 'validate' && resuming) ? 'failed' : 'cleanup';
      return;
    }
    if (cursor.phase === 'push') {
      cursor.index += 1;
      if (cursor.index >= items.length) cursor.phase = 'validate';
    } else if (cursor.phase === 'validate') {
      cursor.phase = items.length ? 'persist' : 'done';
      cursor.index = 0;
      cursor.attempt = 1;
    } else if (cursor.phase === 'persist') {
      activePersist = undefined;
      cursor.index += 1;
      cursor.attempt = 1;
      if (cursor.index >= items.length) cursor.phase = 'done';
    } else if (cursor.phase === 'cleanup') cursor.phase = 'failed';
  }
  async function cleanup(indices?: number[]): Promise<void> {
    const selected = indices
      ? indices.map((index) => snapshot[index].remote)
      : cursor.reason === 'push'
        ? cursor.pushed
        : remotes;
    await canonical.removePendingDirs(selected, clientId);
    cursor.phase = 'failed';
  }
  function failed(): never {
    if (cursor.reason === 'persist') {
      const name = activePersist!.remote.name;
      throw new PersistFailed([name], { [name]: cursor.message });
    }
    throw cursor.error;
  }
  async function continueCanonical(): Promise<boolean> {
    // Only this suffix runs after an acknowledged effect or a lost helper response.
    while (cursor.phase === 'push' && cursor.index < items.length) {
      const effect = await push(cursor.index);
      record(effect);
    }
    if (cursor.phase === 'push') cursor.phase = 'validate';
    if (cursor.phase === 'validate') {
      await canonical.validateRemotes(remotes, clientId, resuming);
      await canonical.persistRemotes(items, clientId);
      return true;
    }
    if (cursor.phase === 'persist' && cursor.index === 0 && cursor.attempt === 1) {
      await canonical.persistRemotes(items, clientId);
      return true;
    }
    while (cursor.phase === 'persist') record(await persist(cursor.index, cursor.attempt));
    if (cursor.phase === 'cleanup') await cleanup();
    if (cursor.phase === 'failed') failed();
    return true;
  }
  while (reply) {
    if (!eligible() || !agrees(reply.directive, cursor, snapshot.length)) return continueCanonical();
    if (cursor.phase === 'done') return true;
    if (cursor.phase === 'failed') failed();
    let effect: Effect;
    if (cursor.phase === 'push') effect = await push(cursor.index);
    else if (cursor.phase === 'validate') effect = await validate(reply.directive.indices);
    else if (cursor.phase === 'persist') effect = await persist(cursor.index, cursor.attempt);
    else {
      await cleanup(reply.directive.indices);
      effect = { success: true };
    }
    // Record the actual Node receipt before requesting the next Rust directive.
    if (reply.directive.kind !== 'cleanup') record(effect);
    const previous = reply;
    reply = await requestRustTransfer(
      {
        kind: 'transferTransactionReceipt',
        token: previous.token,
        revision: previous.revision,
        success: effect.success,
      },
      (data: any) => matches(data, previous.revision + 1, snapshot.length, previous.token)
    );
  }
  return continueCanonical();
}
