import { Component, ComponentMap } from '@teambit/component';
import { Compiler } from '@teambit/compiler';
import { join } from 'path';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { BuildContext } from '@teambit/builder';
import { normalizeMfName } from './normalize-mf-name';
import { PreviewDefinition } from './preview-definition';

export async function computeExposes(
  rootPath: string,
  defs: PreviewDefinition[],
  component: Component,
  compiler: Compiler
): Promise<Record<string, string>> {
  const compFullName = component.id.fullName;
  const compIdCamel = normalizeMfName(compFullName);
  const mainFile = component.state._consumer.mainFile;
  const mainFilePath = join(rootPath, compiler.getDistPathBySrcPath(mainFile));
  const exposes = {
    [`./${compIdCamel}`]: mainFilePath,
  };

  const moduleMapsPromise = defs.map(async (previewDef) => {
    const moduleMap = await previewDef.getModuleMap([component]);
    const currentExposes = getExposedModuleByPreviewDefPrefixAndModuleMap(
      rootPath,
      compFullName,
      previewDef.prefix,
      moduleMap,
      compiler.getDistPathBySrcPath.bind(compiler)
    );
    Object.assign(exposes, currentExposes);
  });

  await Promise.all(moduleMapsPromise);
  return exposes;
}

export function getExposedModuleByPreviewDefPrefixAndModuleMap(
  rootPath: string,
  compFullName: string,
  previewDefPrefix: string,
  moduleMap: ComponentMap<AbstractVinyl[]>,
  getDistPathBySrcPath: (string) => string
): Record<string, string> {
  const paths = moduleMap.map((files) => {
    return files.map((file) => join(rootPath, getDistPathBySrcPath(file.relative)));
  });
  const exposes = {};
  paths.toArray().map(([, files], index) => {
    files.map((filePath) => {
      const exposedModule = getExposedModuleByPreviewDefPrefixFileAndIndex(
        compFullName,
        previewDefPrefix,
        filePath,
        index
      );
      Object.assign(exposes, {
        [exposedModule.exposedKey]: exposedModule.exposedVal,
      });
      return undefined;
    });
    return undefined;
  });
  return exposes;
}

export function getExposedModuleByPreviewDefPrefixFileAndIndex(
  compFullName: string,
  previewDefPrefix: string,
  filePath: string,
  index: number
): { exposedKey: string; exposedVal: string } {
  const exposedKey = `./${computeExposeKey(compFullName, previewDefPrefix, index)}`;
  return {
    exposedKey,
    exposedVal: filePath,
  };
}

export function computeExposeKey(componentFullName: string, previewDefPrefix: string, index: number): string {
  const compNameNormalized = normalizeMfName(componentFullName);
  return `${compNameNormalized}_${previewDefPrefix}_${index}`;
}
