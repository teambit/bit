import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import Vinyl from 'vinyl';
import path from 'path';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { flatten } from 'lodash';
import { PathOsBasedRelative } from '@teambit/legacy/dist/utils/path';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { composeComponentPath } from '@teambit/legacy/dist/utils/bit/compose-component-path';
import { BitId } from '@teambit/legacy-bit-id';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentTemplate, File } from './component-template';
import { GeneratorAspect } from './generator.aspect';
import { GeneratorCmd } from './generator.cmd';

export type ComponentTemplateSlot = SlotRegistry<ComponentTemplate[]>;

export type GeneratorConfig = {
  /**
   * array of aspects to include in the list of templates.
   */
  aspects: string[];
};

export class GeneratorMain {
  constructor(
    private componentTemplateSlot: ComponentTemplateSlot,
    private config: GeneratorConfig,
    private workspace: Workspace
  ) {}

  /**
   * register a new component template.
   */
  registerComponentTemplate(templates: ComponentTemplate[]) {
    this.componentTemplateSlot.register(templates);
    return this;
  }

  /**
   * list all component templates registered in the workspace.
   */
  listComponentTemplates() {
    return flatten(this.componentTemplateSlot.values());
  }

  /**
   * get all component templates registered by a specific aspect ID.
   */
  getComponentTemplateByAspect(aspectId: string): ComponentTemplate[] {
    return this.componentTemplateSlot.get(aspectId) || [];
  }

  /**
   * returns a specific component template.
   */
  getComponentTemplate(name: string, aspectId?: string): ComponentTemplate | undefined {
    const templatesByAspects = this.componentTemplateSlot.toArray();
    const templates = templatesByAspects.flatMap(([id, tpls]) => {
      return tpls.map((template) => {
        return {
          id,
          template,
        };
      });
    });

    const found = templates.find(({ id, template }) => {
      if (!aspectId || id !== aspectId) return false;
      return template.name === name;
    });
    return found?.template;
  }

  async generateComponentTemplate(componentName: string, templateName: string, aspectId?: string) {
    const template = this.getComponentTemplate(templateName, aspectId);
    if (!template) throw new Error(`template ${templateName} was not found`);
    const files = template.generateFiles({ componentName });
    const componentPath = this.getComponentPath(componentName);
    await this.writeComponentFiles(componentPath, files);
    return this.workspace.add([componentPath], componentName, template.main);
  }

  /**
   * writes the generated template files to the default directory set in the workspace config
   */
  private async writeComponentFiles(componentPath: string, templateFiles: File[]): Promise<PathOsBasedRelative[]> {
    const dataToPersist = new DataToPersist();
    const vinylFiles = templateFiles.map((templateFile) => {
      const templateFileVinyl = new Vinyl({
        base: componentPath,
        path: path.join(componentPath, templateFile.relativePath),
        contents: Buffer.from(templateFile.content),
      });
      return AbstractVinyl.fromVinyl(templateFileVinyl);
    });
    const results = vinylFiles.map((v) => v.path);
    dataToPersist.addManyFiles(vinylFiles);
    dataToPersist.addBasePath(this.workspace.path);
    await dataToPersist.persistAllToFS();
    return results;
  }

  private getComponentPath(name: string) {
    return composeComponentPath(new BitId({ name }), this.workspace.legacyDefaultDirectory);
  }

  static slots = [Slot.withType<ComponentTemplate[]>()];

  static dependencies = [WorkspaceAspect, CLIAspect];

  static runtime = MainRuntime;

  static async provider(
    [workspace, cli]: [Workspace, CLIMain],
    config: GeneratorConfig,
    [componentTemplateSlot]: [ComponentTemplateSlot]
  ) {
    const generator = new GeneratorMain(componentTemplateSlot, config, workspace);
    cli.register(new GeneratorCmd(generator));
    return generator;
  }
}

GeneratorAspect.addRuntime(GeneratorMain);
