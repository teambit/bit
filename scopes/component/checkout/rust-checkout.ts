import { createHash } from 'crypto';
import path from 'path';
import { Consumer } from '@teambit/legacy.consumer';
import type { ComponentID } from '@teambit/component-id';
import { ModelComponent, Ref, type SourceFileModel } from '@teambit/objects';
import {
  SourceFile,
  createRustCheckoutSourceFile,
  getRustCheckoutSourceDescriptor,
  withWorkspaceSession,
} from '@teambit/component.sources';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import { BitMap, isWorkspaceMapFile, WORKSPACE_ROOT_DIR } from '@teambit/legacy.bit-map';

const MAX_JSON = 4 * 1024 * 1024;
const MAX_FILES = 4096;
type Manifest = { hash: string; relativePath: string; name?: string; test?: boolean };
type Current = { relativePath: string; hash: string; path: string; protected: boolean };
type Status = { relativePath: string; status: 'updated' | 'unchanged' | 'removed' };
type Plan = { versionHash: string; files: Manifest[]; statuses: Status[]; removals: string[] };
export type PreparedCheckout = {
  component: ConsumerComponent;
  statuses: Status[];
  removals: string[];
  valid: () => boolean;
};

function digest(contents: Buffer): string {
  return createHash('sha1').update(contents).digest('hex');
}

function manifest(models: SourceFileModel[]): Manifest[] {
  return models.map((model) => ({
    hash: model.file.toString(),
    relativePath: model.relativePath,
    name: model.name,
    test: model.test,
  }));
}

function ordinaryCurrent(file: SourceFile): boolean {
  const parent = Object.getPrototypeOf(SourceFile.prototype);
  return (
    file instanceof SourceFile &&
    Object.getPrototypeOf(file) === SourceFile.prototype &&
    ['contents', 'relative', 'path'].every(
      (name) => !Object.hasOwn(SourceFile.prototype, name) && !Object.hasOwn(parent, name)
    ) &&
    !Object.getOwnPropertyDescriptor(file, 'contents')?.get &&
    !Object.getOwnPropertyDescriptor(file, 'relative')?.get &&
    !Object.getOwnPropertyDescriptor(file, 'path')?.get
  );
}

function modelMethods(model: ModelComponent): boolean {
  return (
    model.toConsumerComponent === ModelComponent.prototype.toConsumerComponent &&
    model.toComponentVersion === ModelComponent.prototype.toComponentVersion &&
    model.getRef === ModelComponent.prototype.getRef &&
    model.loadVersion === ModelComponent.prototype.loadVersion &&
    model.hash === ModelComponent.prototype.hash &&
    model.id === ModelComponent.prototype.id
  );
}

/** Resolve and plan the complete ordinary component before any checkout removal. */
export async function prepareRustCheckout(
  consumer: Consumer,
  id: ComponentID,
  current?: ConsumerComponent | null
): Promise<PreparedCheckout | undefined> {
  if (
    process.env.BIT_RUST_CLIENT_VCS !== 'on' ||
    !id.version ||
    consumer.loadComponentFromModelImportIfNeeded !== Consumer.prototype.loadComponentFromModelImportIfNeeded ||
    (current && consumer.bitMap.getComponentIdIfExist !== BitMap.prototype.getComponentIdIfExist) ||
    (current && !current.componentMap)
  )
    return undefined;
  const repository = consumer.scope.objects;
  const model = await consumer.scope.getModelComponent(id);
  if (!modelMethods(model)) return undefined;
  const selected = model.toComponentVersion(id.version);
  const reference = model.getRef(selected.version);
  if (!reference || !/^[a-f0-9]{40}$/.test(reference.toString())) return undefined;
  const version = await selected.getVersion(repository);
  const models = version.files;
  if (!models?.length || models.length > MAX_FILES) return undefined;
  const componentHash = model.hash().toString();
  const versionHash = reference.toString();
  if (!repository.canPlanCheckoutNatively([new Ref(componentHash), reference])) return undefined;
  if (!models.every((file) => file.file.load === Ref.prototype.load)) return undefined;
  if (!repository.canReadCheckoutSourcesNatively(models.map((file) => file.file))) return undefined;
  const expectedFiles = manifest(models);
  const modelsSnapshot = models.slice();
  const serializedManifest = JSON.stringify(expectedFiles);
  const currentFiles = current?.files || [];
  if (currentFiles.length > MAX_FILES || !currentFiles.every(ordinaryCurrent)) return undefined;
  const currentSnapshot = currentFiles.slice();
  const targets = new Set(expectedFiles.map((file) => file.relativePath));
  if (
    currentSnapshot.some((file) => targets.has(pathNormalizeToLinux(file.relative)) && !Buffer.isBuffer(file.contents))
  )
    return undefined;
  const componentMap = current?.componentMap;
  const rootDir = componentMap?.rootDir;
  const tracked = current ? Boolean(consumer.bitMap.getComponentIdIfExist(current.id, { ignoreVersion: true })) : false;
  const projectCurrent = (): Current[] =>
    currentSnapshot.map((file) => {
      const relativePath = pathNormalizeToLinux(file.relative);
      return {
        relativePath,
        // Unmatched removal candidates do not require reading their contents.
        hash: targets.has(relativePath) ? digest(file.contents) : '0'.repeat(40),
        path: file.path,
        protected: !tracked || (rootDir === WORKSPACE_ROOT_DIR && isWorkspaceMapFile(relativePath)),
      };
    });
  const currentProjection = projectCurrent();
  const serializedCurrent = JSON.stringify(currentProjection);
  const objectsDirectory = path.resolve(repository.getPath());
  const valid = () =>
    process.env.BIT_RUST_CLIENT_VCS === 'on' &&
    consumer.loadComponentFromModelImportIfNeeded === Consumer.prototype.loadComponentFromModelImportIfNeeded &&
    modelMethods(model) &&
    model.hash().toString() === componentHash &&
    model.getRef(selected.version)?.toString() === versionHash &&
    repository.canPlanCheckoutNatively([new Ref(componentHash), reference]) &&
    repository.canReadCheckoutSourcesNatively(modelsSnapshot.map((file) => file.file)) &&
    path.resolve(repository.getPath()) === objectsDirectory &&
    version.files === models &&
    models.length === modelsSnapshot.length &&
    models.every((file, index) => file === modelsSnapshot[index] && file.file.load === Ref.prototype.load) &&
    JSON.stringify(manifest(models)) === serializedManifest &&
    (!current ||
      (current.files === currentFiles &&
        currentFiles.length === currentSnapshot.length &&
        currentFiles.every((file, index) => file === currentSnapshot[index] && ordinaryCurrent(file)) &&
        current.componentMap === componentMap &&
        current.componentMap?.rootDir === rootDir &&
        consumer.bitMap.getComponentIdIfExist === BitMap.prototype.getComponentIdIfExist &&
        Boolean(consumer.bitMap.getComponentIdIfExist(current.id, { ignoreVersion: true })) === tracked)) &&
    currentSnapshot.every(
      (file) => !targets.has(pathNormalizeToLinux(file.relative)) || Buffer.isBuffer(file.contents)
    ) &&
    JSON.stringify(projectCurrent()) === serializedCurrent;
  const input = Buffer.from(
    JSON.stringify({
      objectsDirectory,
      componentHash,
      requestedVersion: selected.version,
      expectedVersionHash: versionHash,
      current: currentProjection,
      expectedFiles,
    })
  );
  if (input.length > MAX_JSON) return undefined;
  let plan: Plan | undefined;
  await withWorkspaceSession(async (session) => {
    await session.request(
      (requestId) => {
        const header = Buffer.alloc(12);
        header.write('BCK1');
        header.writeUInt32BE(requestId, 4);
        header.writeUInt32BE(input.length, 8);
        return Buffer.concat([header, input]);
      },
      expectedFiles.length,
      (response) => {
        if (response.failed) return true;
        if (!validPlan(response.plan, versionHash, expectedFiles, currentProjection)) return false;
        plan = response.plan;
        return true;
      },
      MAX_JSON
    );
  });
  if (!plan || !valid()) return undefined;
  const files = models.map((file) => createRustCheckoutSourceFile(file, repository, true));
  if (!files.every((file): file is SourceFile => Boolean(file))) return undefined;
  const component = await model.toConsumerComponent(selected.version, model.scope, repository, files);
  if (!valid() || component.files !== files || !files.every((file) => getRustCheckoutSourceDescriptor(file)))
    return undefined;
  return { component, statuses: plan.statuses, removals: plan.removals, valid };
}

function validPlan(value: unknown, versionHash: string, files: Manifest[], current: Current[]): value is Plan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Plan;
  if (plan.versionHash !== versionHash || JSON.stringify(plan.files) !== JSON.stringify(files)) return false;
  if (!Array.isArray(plan.statuses) || !Array.isArray(plan.removals)) return false;
  const old = new Map(current.map((file) => [file.relativePath, file]));
  if (old.size !== current.length || new Set(files.map((file) => file.relativePath)).size !== files.length)
    return false;
  const targets = new Set(files.map((file) => file.relativePath));
  const removed = current.filter((file) => !file.protected && !targets.has(file.relativePath));
  const statuses: Status[] = [
    ...files.map(
      (file): Status => ({
        relativePath: file.relativePath,
        status: old.get(file.relativePath)?.hash === file.hash ? 'unchanged' : 'updated',
      })
    ),
    ...removed.map((file): Status => ({ relativePath: file.relativePath, status: 'removed' })),
  ];
  return (
    JSON.stringify(plan.statuses) === JSON.stringify(statuses) &&
    JSON.stringify(plan.removals) === JSON.stringify(removed.map((file) => file.path))
  );
}
