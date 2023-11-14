import { ComponentID } from '@teambit/component-id';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { SourceFile } from '@teambit/legacy/dist/consumer/component/sources';
import { ModelComponent } from '@teambit/legacy/dist/scope/models';
import { ScopeMain } from '@teambit/scope';
import ComponentOverrides from '@teambit/legacy/dist/consumer/config/component-overrides';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config';
import { Component } from '@teambit/component';
import { FileData } from './snap-from-scope.cmd';

export type CompData = {
  componentId: ComponentID;
  dependencies: ComponentID[];
  aspects: Record<string, any> | undefined;
  message: string | undefined;
  files: FileData[] | undefined;
};

/**
 * normally new components are created from a workspace. the files are in the filesystem and the ConsumerComponent
 * object is created from the files.
 * here, we need to create the ConsumerComponent object "on the fly". we don't have workspace, only scope. the files
 * are in-memory (we got them from snap-from-scope command).
 * the way how it is done is by creating a minimal ConsumerComponent object, then convert `Version` object from it,
 * write the version and files into the scope as objects, so then it's possible to load Component object using the
 * ConsumerComponent.
 */
export async function generateCompFromScope(scope: ScopeMain, compData: CompData): Promise<Component> {
  if (!compData.files) throw new Error('generateComp: files are missing');
  const files = compData.files.map((file) => {
    return new SourceFile({ base: '.', path: file.path, contents: Buffer.from(file.content), test: false });
  });
  const consumerComponent = new ConsumerComponent({
    mainFile: 'index.ts',
    name: compData.componentId.fullName,
    scope: compData.componentId.scope,
    files,
    overrides: ComponentOverrides.loadFromScope({}),
    defaultScope: compData.componentId.scope,
    extensions: new ExtensionDataList(),
    log: {
      message: compData.message || '',
      date: Date.now().toString(),
      username: '',
      email: '',
    },
  });
  const { version, files: filesBitObject } = await scope.legacyScope.sources.consumerComponentToVersion(
    consumerComponent
  );
  const modelComponent = ModelComponent.fromBitId(compData.componentId);
  consumerComponent.version = version.hash().toString();
  await scope.legacyScope.objects.writeObjectsToTheFS([version, modelComponent, ...filesBitObject.map((f) => f.file)]);
  const component = await scope.getManyByLegacy([consumerComponent]);

  return component[0];
}
