import path from 'path';
import { Workspace } from '../workspace';
import ConsumerComponent from '../../consumer/component';
import { BitId } from '../../bit-id';
import { ResolvedComponent } from '../workspace/resolved-component';
import buildComponent from '../../consumer/component-ops/build-component';
import { Component } from '../component';
import { Capsule } from '../isolator';
import DataToPersist from '../../consumer/component/sources/data-to-persist';
import { Scope } from '../scope';
import { Flows, IdsAndFlows } from '../flows';

export type ComponentAndCapsule = {
  consumerComponent: ConsumerComponent;
  component: Component;
  capsule: Capsule;
};

type buildHookResult = { id: BitId; dists?: Array<{ path: string; content: string }> };

export class Compile {
  constructor(private workspace: Workspace, private flows: Flows, private scope: Scope) {
    const func = this.compileDuringBuild.bind(this);
    if (this.scope?.onBuild) this.scope.onBuild.push(func);
  }

  async compileDuringBuild(ids: BitId[]): Promise<buildHookResult[]> {
    const reportResults: any = await this.compile(ids.map(id => id.toString()));
    const resultsP = Object.values(reportResults.value).map(async (reportResult: any) => {
      const result = reportResult.result.value.tasks;
      const id: BitId = reportResult.result.id;
      if (!result.length || !result[0].value) return { id };
      const distDir = result[0].value.dir;
      if (!distDir) {
        throw new Error(
          `compile extension failed on ${id.toString()}, it expects to get "dir" as a result of executing the compilers`
        );
      }
      const capsule: Capsule = reportResult.result.value.capsule;
      const distFiles = await getFilesFromCapsuleRecursive(capsule, distDir, path.join(capsule.wrkDir, distDir));
      const distFilesObjects = distFiles.map(distFilePath => {
        const distPath = path.join(distDir, distFilePath);
        return {
          path: distFilePath,
          content: capsule.fs.readFileSync(distPath).toString()
        };
      });
      return { id, dists: distFilesObjects };
    });
    return Promise.all(resultsP);
  }

  // @todo: what is the return type here?
  async compile(componentsIds: string[]) {
    const componentAndCapsules = await getComponentsAndCapsules(componentsIds, this.workspace);
    const idsAndScriptsArr = componentAndCapsules
      .map(c => {
        const compileConfig = c.component.config.extensions.findCoreExtension('compile')?.config;
        const compiler = compileConfig ? [compileConfig.compiler] : [];
        return { id: c.consumerComponent.id, value: compiler };
      })
      .filter(i => i.value);
    const idsAndFlows = new IdsAndFlows(...idsAndScriptsArr);
    return this.flows.runMultiple(idsAndFlows, { traverse: 'only' });
  }

  async legacyCompile(componentsIds: string[], params: { verbose: boolean; noCache: boolean }) {
    const populateDistTask = this.populateComponentDist.bind(this, params);
    const writeDistTask = this.writeComponentDist.bind(this);
    await pipeRunTask(componentsIds, populateDistTask, this.workspace);
    return pipeRunTask(componentsIds, writeDistTask, this.workspace);
  }

  populateComponentDist(params: { verbose: boolean; noCache: boolean }, component: ComponentAndCapsule) {
    return buildComponent({
      component: component.consumerComponent,
      scope: this.workspace.consumer.scope,
      consumer: this.workspace.consumer,
      verbose: params.verbose,
      noCache: params.noCache
    });
  }

  async writeComponentDist(componentAndCapsule: ComponentAndCapsule) {
    const dataToPersist = new DataToPersist();
    const distsFiles = componentAndCapsule.consumerComponent.dists.get();
    distsFiles.map(d => d.updatePaths({ newBase: 'dist' }));
    dataToPersist.addManyFiles(distsFiles);
    await dataToPersist.persistAllToCapsule(componentAndCapsule.capsule);
    return distsFiles.map(d => d.path);
  }
}

function getBitIds(componentsIds: string[], workspace: Workspace): BitId[] {
  if (componentsIds.length) {
    return componentsIds.map(idStr => workspace.consumer.getParsedId(idStr));
  }
  return workspace.consumer.bitMap.getAuthoredAndImportedBitIds();
}

async function getResolvedComponents(componentsIds: string[], workspace: Workspace): Promise<ResolvedComponent[]> {
  const bitIds = getBitIds(componentsIds, workspace);
  return workspace.load(bitIds.map(id => id.toString()));
}

async function getComponentsAndCapsules(componentsIds: string[], workspace: Workspace): Promise<ComponentAndCapsule[]> {
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

async function pipeRunTask(ids: string[], task: Function, workspace: Workspace) {
  const components = await getComponentsAndCapsules(ids, workspace);
  const results = await Promise.all(components.map(component => task(component)));
  return { results, components };
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
