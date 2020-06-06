import path from 'path';
import { ReleaseContext } from '../releases';
import { ReleaseTask } from '../releases/release-pipe';
import { Compiler } from './compiler';
import logger from '../../logger/logger';
import { Workspace } from '../workspace';
import GeneralError from '../../error/general-error';
import { Dist } from '../../consumer/component/sources';
import { Capsule } from '../isolator';
import { ResolvedComponent } from '../utils/resolved-component/resolved-component';
import { BitId } from '../../bit-id';
import { Component } from '../component';
import ConsumerComponent from '../../consumer/component';

type BuildResult = { component: string; buildResults: string[] | null | undefined };

type buildHookResult = { id: BitId; dists?: Array<{ path: string; content: string }> };

/**
 * compiler release task. Allows to compile components during component releases.
 */
export class CompileTask implements ReleaseTask {
  constructor(private workspace: Workspace) {}

  async execute(context: ReleaseContext) {
    const compilerInstance: Compiler = context.env.getCompiler();
    const componentsIds = context.components.map(c => c.id.legacyComponentId);
    const componentsAndCapsules = await getComponentsAndCapsules(componentsIds, this.workspace);
    const consumerComponents = componentsAndCapsules.map(c => c.consumerComponent);
    logger.debug(`compilerExt, completed created of capsules for ${componentsIds.join(', ')}`);
    const capsulesDir = componentsAndCapsules.map(c => c.capsule.wrkDir);
    const results = compilerInstance.compileOnCapsules(capsulesDir);
    if (results.error) {
      if (!(results.error instanceof Error)) throw new Error(results.error);
      throw results.error;
    }
    const distDir = 'dist'; // @todo: get it from results.
    const resultsP = componentsAndCapsules.map(async c => {
      const distFiles = await getFilesFromCapsuleRecursive(c.capsule, distDir, path.join(c.capsule.wrkDir, distDir));
      const distFilesObjects = distFiles.map(distFilePath => {
        const distPath = path.join(distDir, distFilePath);
        return {
          path: distFilePath,
          content: c.capsule.fs.readFileSync(distPath).toString()
        };
      });
      return { id: c.consumerComponent.id, dists: distFilesObjects };
    });
    const extensionsResults: buildHookResult[] = await Promise.all(resultsP);
    // @ts-ignore
    const buildResults = consumerComponents
      .map(component => {
        const resultFromCompiler = extensionsResults.find(r => component.id.isEqualWithoutVersion(r.id));
        if (!resultFromCompiler || !resultFromCompiler.dists) return null;
        const builtFiles = resultFromCompiler.dists;
        builtFiles.forEach(file => {
          if (!file.path || !('content' in file) || typeof file.content !== 'string') {
            throw new GeneralError(
              'compile interface expects to get files in a form of { path: string, content: string }'
            );
          }
        });
        const distsFiles = builtFiles.map(file => {
          return new Dist({
            path: file.path,
            contents: Buffer.from(file.content)
          });
        });
        component.setDists(distsFiles);
        return { component: component.id.toString(), buildResults: builtFiles.map(b => b.path) };
      })
      .filter(x => x);
    return buildResults as BuildResult[];
  }
}

// @todo: refactor. was taken partly from stackOverflow.
// it uses the absolute path because for some reason `capsule.fs.promises.readdir` doesn't work
// the same as `capsule.fs.readdir` and it doesn't have the capsule dir as pwd.
async function getFilesFromCapsuleRecursive(capsule: Capsule, distDir: string, dir: string) {
  const subDirs = await capsule.fs.promises.readdir(dir);
  const files = await Promise.all(
    subDirs.map(async subDir => {
      const res = path.resolve(dir, subDir);
      return (await capsule.fs.promises.stat(res)).isDirectory()
        ? getFilesFromCapsuleRecursive(capsule, distDir, res)
        : path.relative(path.join(capsule.wrkDir, distDir), res);
    })
  );
  return files.reduce((a, f) => a.concat(f), []);
}

async function getComponentsAndCapsules(
  componentsIds: string[] | BitId[],
  workspace: Workspace
): Promise<ComponentAndCapsule[]> {
  const resolvedComponents = await getResolvedComponents(componentsIds, workspace);
  return Promise.all(
    resolvedComponents.map(async (resolvedComponent: ResolvedComponent) => {
      // @todo: it says id._legacy "do not use this", do I have a better option to get the id?
      const consumerComponent = await workspace.consumer.loadComponent(resolvedComponent.component.id._legacy);
      return {
        consumerComponent,
        component: resolvedComponent.component,
        capsule: resolvedComponent.capsule
      };
    })
  );
}

async function getResolvedComponents(
  componentsIds: string[] | BitId[],
  workspace: Workspace
): Promise<ResolvedComponent[]> {
  const bitIds = getBitIds(componentsIds, workspace);
  return workspace.load(bitIds.map(id => id.toString()));
}

function getBitIds(componentsIds: Array<string | BitId>, workspace: Workspace): BitId[] {
  if (componentsIds.length) {
    return componentsIds.map(compId => (compId instanceof BitId ? compId : workspace.consumer.getParsedId(compId)));
  }
  return workspace.consumer.bitMap.getAuthoredAndImportedBitIds();
}

export type ComponentAndCapsule = {
  consumerComponent: ConsumerComponent;
  component: Component;
  capsule: Capsule;
};
