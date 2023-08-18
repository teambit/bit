import { ComponentContext } from '@teambit/generator';

export function componentTemplate({ nameCamelCase, name }: ComponentContext) {
  return `import {
    ComponentContext,
    ComponentFile,
    ComponentTemplate,
  } from '@teambit/generator';
  import { indexFile } from './files/index-file';
  import { componentFile } from './files/component-file';
  import { testFile } from './files/test-file';
  import { compositionFile } from './files/composition-file';
  
  export type ${nameCamelCase}ComponentTemplateOptions = {
    /**
     * name of the template
     */
    name?: string;
  
    /**
     * description of the template.
     */
    description?: string;
  
    /**
     * hide the template from the templates command.
     */
    hidden?: boolean;
  };
  
  export class ${nameCamelCase}ComponentTemplate implements ComponentTemplate {
    constructor(
      readonly name = '${name}',
      readonly description = 'a template for ${name} components',
      readonly hidden = false
    ) {}
  
    generateFiles(context: ComponentContext): ComponentFile[] {
      return [
        indexFile(context),
        compositionFile(context),
        componentFile(context),
        testFile(context),
      ];
    }
  
    static from(options: ${nameCamelCase}ComponentTemplateOptions = {}) {
      return () =>
        new ${nameCamelCase}ComponentTemplate(
          options.name,
          options.description,
          options.hidden
        );
    }
  }
  
`;
}
