import { compact } from 'lodash';
import { BitError } from '@teambit/bit-error';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import type { ComponentID } from '@teambit/component-id';
import type { AspectList } from '@teambit/component';
import { OutsideWorkspaceError } from './exceptions/outside-workspace';
import type { Workspace, ExtensionsOrigin } from './workspace';
import type { SetAspectOptions } from './aspect.cmd';

export type AspectSource = { aspectName: string; source: string; level: string };

/**
 * manage aspects configuration on workspace components. serves the `bit aspect` command.
 * (previously part of AspectMain, moved here when teambit.harmony/aspect was removed from the core aspects)
 */
export class WorkspaceAspectsManager {
  constructor(
    private _workspace: Workspace | undefined,
    private aspectLoader: AspectLoaderMain
  ) {}

  private get workspace(): Workspace {
    if (!this._workspace) throw new OutsideWorkspaceError();
    return this._workspace;
  }

  async listAspectsOfComponent(pattern?: string): Promise<{ [component: string]: AspectSource[] }> {
    const getIds = async () => {
      if (!pattern) return this.workspace.listIds();
      return this.workspace.idsByPattern(pattern);
    };
    const componentIds = await getIds();
    const results: { [component: string]: AspectSource[] } = {};
    await Promise.all(
      componentIds.map(async (id) => {
        const aspectSources = await this.getAspectNamesForComponent(id);
        results[id.toString()] = aspectSources;
      })
    );
    return results;
  }

  listCoreAspects(): string[] {
    return this.aspectLoader.getCoreAspectIds();
  }

  private async getAspectNamesForComponent(id: ComponentID): Promise<AspectSource[]> {
    const componentFromScope = await this.workspace.scope.get(id);
    const { beforeMerge } = await this.workspace.componentExtensions(id, componentFromScope);
    const aspectSources: AspectSource[] = [];
    beforeMerge.forEach((source) => {
      source.extensions.forEach((ext) => {
        const aspectName = ext.name || ext.extensionId?.toString() || '<no-name>';
        const alreadySaved = aspectSources.find((_) => _.aspectName === aspectName);
        if (alreadySaved) return;
        aspectSources.push({ aspectName, source: source.origin, level: this.getLevelBySourceOrigin(source.origin) });
      });
    });
    return aspectSources;
  }

  private getLevelBySourceOrigin(origin: ExtensionsOrigin) {
    switch (origin) {
      case 'BitmapFile':
      case 'ComponentJsonFile':
      case 'ModelSpecific':
        return 'component';
      default:
        return 'workspace';
    }
  }

  async setAspectsToComponents(
    pattern: string,
    aspectId: string,
    config: Record<string, any> = {},
    options: SetAspectOptions = {}
  ): Promise<ComponentID[]> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    await Promise.all(
      componentIds.map(async (componentId) => {
        await this.workspace.addSpecificComponentConfig(componentId, aspectId, config, {
          shouldMergeWithExisting: options.merge,
        });
      })
    );
    await this.workspace.bitMap.write(`aspect-set (${aspectId})`);

    return componentIds;
  }

  async unsetAspectsFromComponents(pattern: string, aspectIdStr: string): Promise<ComponentID[]> {
    const componentIds = await this.workspace.idsByPattern(pattern);
    const aspectId = await this.workspace.resolveComponentId(aspectIdStr);
    const components = await this.workspace.getMany(componentIds);
    const updatedCompIds: ComponentID[] = [];
    await Promise.all(
      components.map(async (component) => {
        const existAspect = component.state.aspects.get(aspectId.toStringWithoutVersion());
        if (!existAspect) return;
        await this.workspace.removeSpecificComponentConfig(component.id, existAspect.id.toString(), true);
        updatedCompIds.push(component.id);
      })
    );
    await this.workspace.bitMap.write(`aspect-unset (${aspectId})`);
    return updatedCompIds;
  }

  /**
   * returns all aspects info of a component, include the config and the data.
   */
  async getAspectsOfComponent(id: string | ComponentID): Promise<AspectList> {
    if (typeof id === 'string') {
      id = await this.workspace.resolveComponentId(id);
    }
    const component = await this.workspace.get(id);
    return component.state.aspects;
  }

  /**
   * helps debugging why/how an aspect was set to a component
   */
  async getAspectsOfComponentForDebugging(id: string | ComponentID) {
    if (typeof id === 'string') {
      id = await this.workspace.resolveComponentId(id);
    }
    const componentFromScope = await this.workspace.scope.get(id);
    const { extensions, beforeMerge } = await this.workspace.componentExtensions(id, componentFromScope);
    const component = await this.workspace.get(id);
    return {
      aspects: component.state.aspects,
      extensions,
      beforeMerge,
    };
  }

  async updateAspectsToComponents(
    aspectId: string,
    pattern?: string
  ): Promise<{ updated: ComponentID[]; alreadyUpToDate: ComponentID[] }> {
    let aspectCompId = await this.workspace.resolveComponentId(aspectId);
    if (!aspectCompId.hasVersion()) {
      try {
        const fromRemote = await this.workspace.scope.getRemoteComponent(aspectCompId);
        aspectCompId = aspectCompId.changeVersion(fromRemote.id.version);
      } catch {
        throw new BitError(
          `unable to find ${aspectId} in the remote. if this is a local aspect, please provide a version with your aspect (${aspectId}) to update to`
        );
      }
    }
    const allCompIds = pattern ? await this.workspace.idsByPattern(pattern) : this.workspace.listIds();
    const allComps = await this.workspace.getMany(allCompIds);
    const alreadyUpToDate: ComponentID[] = [];
    const updatedComponentIds = await Promise.all(
      allComps.map(async (comp) => {
        const aspect = comp.state.aspects.get(aspectCompId.toStringWithoutVersion());
        if (!aspect) return undefined;
        if (aspect.id.version === aspectCompId.version) {
          // nothing to update
          alreadyUpToDate.push(comp.id);
          return undefined;
        }
        // don't mark with minus if not exist in .bitmap. it's not needed. when the component is loaded, the
        // merge-operation of the aspects removes duplicate aspect-id with different versions.
        await this.workspace.removeSpecificComponentConfig(comp.id, aspect.id.toString(), false);
        await this.workspace.addSpecificComponentConfig(comp.id, aspectCompId.toString(), aspect.config);
        return comp.id;
      })
    );
    await this.workspace.bitMap.write(`aspect-update (${aspectCompId})`);
    return { updated: compact(updatedComponentIds), alreadyUpToDate };
  }
}
