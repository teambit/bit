import chalk from 'chalk';
import { EnvService, Env, EnvContext, ServiceTransformationMap, EnvDefinition } from '@teambit/envs';
import { pick } from 'lodash';
import { ComponentTemplate, ComponentTemplateOptions } from './component-template';
import { WorkspaceTemplate, WorkspaceTemplateOptions } from './workspace-template';

type GeneratorTransformationMap = ServiceTransformationMap & {
  getGeneratorTemplates: () => ComponentTemplate[];
  getGeneratorStarters: () => WorkspaceTemplate[];
};

type Descriptor = {
  templates?: ComponentTemplateOptions[];
  starters?: WorkspaceTemplateOptions[];
};
export class GeneratorService implements EnvService<any> {
  name = 'generator';

  transform(env: Env, context: EnvContext): GeneratorTransformationMap | undefined {
    // Old env
    if (!env?.generators) return undefined;
    return {
      getGeneratorTemplates: () => {
        if (!env.generators) return undefined;
        const generatorList = env.generators()(context);
        return generatorList.compute();
      },
      getGeneratorStarters: () => {
        if (!env.starters) return undefined;
        const starterList = env.starters()(context);
        return starterList.compute();
      },
    };
  }

  getDescriptor(env: EnvDefinition): Descriptor | undefined {
    let templates;
    let starters;
    const result: Descriptor = {};

    if (env.env.getGeneratorTemplates) {
      const generatorTemplates: ComponentTemplate[] = env.env.getGeneratorTemplates();

      templates = (generatorTemplates || []).map((template) => {
        return pick(template, [
          'name',
          'displayName',
          'exampleComponentName',
          'description',
          'hidden',
          'env',
          'installMissingDependencies',
          'isEnv',
          'isApp',
          'dependencies',
        ]);
      });
      result.templates = templates;
    }

    if (env.env.getGeneratorTemplates) {
      const generatorStarters: WorkspaceTemplate[] = env.env.getGeneratorStarters();

      starters = (generatorStarters || []).map((template) => {
        return pick(template, ['name', 'description', 'hidden', 'appName']);
      });
      result.starters = starters;
    }

    if (!templates && !starters) return undefined;

    return result;
  }

  render(env: EnvDefinition) {
    const descriptor = this.getDescriptor(env);
    const templates = this.getTemplatesToRender(descriptor?.templates || []);
    const starters = this.getStartersToRender(descriptor?.starters || []);
    return [templates, starters].join('\n\n');
  }

  private getTemplatesToRender(templates: Descriptor['templates']) {
    const templatesLabel = chalk.green('Configured templates:');
    if (!templates) return `${templatesLabel}\nno templates configured`;
    const templatesStr = templates
      .map((template) => {
        const name = template.displayName ? `${template.displayName}(${template.name})` : template.name;
        return `${name} - ${template.description}`;
      })
      .join('\n');
    return `${templatesLabel}\n${templatesStr}`;
  }

  private getStartersToRender(starters: Descriptor['starters']) {
    const startersLabel = chalk.green('Configured starters:');
    if (!starters) return `${startersLabel}\nno starters configured`;
    const startersStr = starters
      .map((starter) => {
        return `${starter.name} - ${starter.description}`;
      })
      .join('\n');
    return `${startersLabel}\n${startersStr}`;
  }
}
