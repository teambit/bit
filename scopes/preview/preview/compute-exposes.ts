import { Component } from '@teambit/component';
import { Compiler } from '@teambit/compiler';
import { join } from 'path';
import { BuildContext } from '@teambit/builder';
import { normalizeMfName } from './normalize-mf-name';
import { PreviewDefinition } from './preview-definition';

export async function computeExposes(
  rootPath: string,
  defs: PreviewDefinition[],
  component: Component,
  compiler: Compiler
): Promise<Record<string, string>> {
  const compIdCamel = normalizeMfName(component.id.fullName);
  const mainFile = component.state._consumer.mainFile;
  const mainFilePath = join(rootPath, compiler.getDistPathBySrcPath(mainFile));
  const exposes = {
    [`./${compIdCamel}`]: mainFilePath,
  };

  const moduleMapsPromise = defs.map(async (previewDef) => {
    const moduleMap = await previewDef.getModuleMap([component]);
    const paths = moduleMap.map((files) => {
      return files.map((file) => join(rootPath, compiler.getDistPathBySrcPath(file.relative)));
    });
    paths.toArray().map(([, files], index) => {
      files.map((filePath) => {
        Object.assign(exposes, {
          [`./${compIdCamel}_${previewDef.prefix}_${index}`]: filePath,
        });
        return undefined;
      });
      return undefined;
    });
  });

  await Promise.all(moduleMapsPromise);
  return exposes;
}
