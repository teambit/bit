import { BuildContext } from '@teambit/builder';
import { Target } from '@teambit/bundler';
import { Compiler } from '@teambit/compiler';
import { Component } from '@teambit/component';
import { ComponentID } from '@teambit/component-id';
import { existsSync, mkdirpSync, writeFileSync } from 'fs-extra';
import { join, resolve } from 'path';
import { ElementsWrapperFn } from './elements.task';

export async function computeTargets(
  context: BuildContext,
  createEntryFn: ElementsWrapperFn,
  outDirName: string
): Promise<Target[]> {
  return Promise.all(context.components.map((comp) => getComponentTarget(context, comp, createEntryFn, outDirName)));
}

async function getComponentTarget(
  context: BuildContext,
  component: Component,
  elementsWrapperFn: ElementsWrapperFn,
  outDirName: string
): Promise<Target> {
  const outputPath = getOutputPath(context, component.id, outDirName);
  if (!existsSync(outputPath)) mkdirpSync(outputPath);

  return {
    entries: [await getEntryFile(outputPath, component, elementsWrapperFn, context)],
    components: [component],
    outputPath,
  };
}

function getOutputPath(context: BuildContext, componentId: ComponentID, outDirName: string): string {
  // return resolve(`${context.capsuleNetwork.capsulesRootDir}/${getDirName(context, componentId)}`);
  const capsule = context.capsuleNetwork.graphCapsules.getCapsule(componentId);
  if (!capsule) throw new Error(`can't find capsule for ${componentId.toString()} while bundling for element`);
  return resolve(`${capsule?.path}/${outDirName}`);
}

async function getEntryFile(
  outputPath: string,
  component: Component,
  elementsWrapperFn: ElementsWrapperFn,
  context: BuildContext
): Promise<string> {
  const mainFilePath = getMainFilePath(context, component);
  const entryContent = elementsWrapperFn({ mainFilePath, componentName: component.id.name });
  const targetPath = join(outputPath, `__elements.js`);
  writeFileSync(targetPath, entryContent);
  return targetPath;
}

function getMainFilePath(context: BuildContext, component: Component): string {
  const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
  if (!capsule) throw new Error(`can't find capsule for ${component.id.toString()} while bundling for element`);
  const mainFile = component.state._consumer.mainFile;
  const compiler: Compiler = context.env.getCompiler();
  return join(capsule.path, compiler.getDistPathBySrcPath(mainFile));
}
