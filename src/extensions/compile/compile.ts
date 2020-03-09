import { subscribe, Extension } from '@teambit/harmony';
import { Workspace } from '../workspace';
import ConsumerComponent from '../../consumer/component';
import { BitId } from '../../bit-id';
import { ResolvedComponent } from '../workspace/resolved-component';
import buildComponent from '../../consumer/component-ops/build-component';
import { Component } from '../component';
import { Capsule } from '../isolator/capsule';
import DataToPersist from '../../consumer/component/sources/data-to-persist';
import { CompileCmd } from './compile.cmd';
import { BitCliExt } from '../cli';
import { Flows } from '../flows';
import { IdsAndFlows } from '../flows/flows';

export type ComponentAndCapsule = {
  consumerComponent: ConsumerComponent;
  component: Component;
  capsule: Capsule;
};

@Extension()
export class Compile {
  constructor(private workspace: Workspace, private scripts: Flows) {}

  async compile(componentsIds: string[]) {
    const componentAndCapsules = await getComponentsAndCapsules(componentsIds, this.workspace);
    // @todo: that's a hack to get the extension name saved in the "build" pipeline.
    // we need to figure out where to store the specific compiler extensions
    const idsAndScriptsArr = componentAndCapsules
      .map(c => {
        const compiler = c.component.config?.extensions?.compile?.compiler;
        return { id: c.consumerComponent.id, value: compiler ? [compiler] : [] };
      })
      .filter(i => i.value);
    const idsAndScripts = new IdsAndFlows(...idsAndScriptsArr);
    const resolvedComponents = await getResolvedComponents(componentsIds, this.workspace);
    return this.scripts.runMultiple(
      idsAndScripts,
      resolvedComponents.map(cap => cap.capsule)
    );
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
  return workspace.consumer.bitMap.getAuthoredAndImportedBitIds(); // refactor to list
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
