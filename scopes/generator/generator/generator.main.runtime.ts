import { MainRuntime } from '@teambit/cli';
import { flatten } from 'lodash';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { ComponentTemplate } from './component-template';
import { GeneratorAspect } from './generator.aspect';

export type ComponentTemplateSlot = SlotRegistry<ComponentTemplate[]>;

export type GeneratorConfig = {
  /**
   * array of aspects to include in the list of templates.
   */
  aspects: string[];
};

export class GeneratorMain {
  constructor(private componentTemplateSlot: ComponentTemplateSlot) {}

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
  getComponentTemplate(name: string, aspectId?: string) {
    const templatesByAspects = this.componentTemplateSlot.toArray();
    const templates = templatesByAspects.flatMap(([id, tpls]) => {
      return tpls.map((template) => {
        return {
          id,
          template,
        };
      });
    });

    return templates.find(({ id, template }) => {
      if (!aspectId || id !== aspectId) return false;
      return template.name === name;
    });
  }

  static slots = [Slot.withType<ComponentTemplate[]>()];

  static runtime = MainRuntime;

  static async provider(deps, config: GeneratorConfig, [componentTemplateSlot]: [ComponentTemplateSlot]) {
    return new GeneratorMain(componentTemplateSlot);
  }
}

GeneratorAspect.addRuntime(GeneratorMain);
