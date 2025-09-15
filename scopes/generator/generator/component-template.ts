import type { ComponentID } from '@teambit/component';

/**
 * BaseComponentTemplateOptions describes the foundational properties for components.
 */
export interface BaseComponentTemplateOptions {
  /**
   * component-name as entered by the user, e.g. `use-date`.
   * without the scope and the namespace.
   */
  name: string;

  /**
   * component-name as upper camel case, e.g. `use-date` becomes `UseDate`.
   * useful when generating the file content, for example for a class name.
   */
  namePascalCase: string;

  /**
   * component-name as lower camel case, e.g. `use-date` becomes `useDate`.
   * useful when generating the file content, for example for a function/variable name.
   */
  nameCamelCase: string;

  /**
   * component id.
   * the name is the name+namespace. the scope is the scope entered by --scope flag or the defaultScope
   */
  componentId: ComponentID;

  /**
   * aspect id of the aspect that register the template itself
   */
  aspectId: ComponentID | string;

  /**
   * env id of the env that register the template itself.
   * This will be usually identical to the aspectId but aspectId will always exist,
   * while envId will be undefined if the template is not registered by an env.
   */
  envId?: ComponentID;

  /**
   * path of the component.
   */
  path?: string;
  /**
   * scope of the component.
   */
  scope?: string;
  /**
   * namespace of the component.
   */
  namespace?: string;
  /**
   * when a template implements the promptOptions function, this object will be populated with the user responses.
   */
  promptResults?: PromptResults;
}

/**
 * ComponentContext represents foundational properties for a component context.
 */
export type ComponentContext = BaseComponentTemplateOptions;

export interface ComponentFile {
  /**
   * relative path of the file within the component.
   */
  relativePath: string;

  /**
   * file content
   */
  content: string;

  /**
   * whether this file will be tracked as the main file
   */
  isMain?: boolean;
}

export interface ConfigContext {
  /**
   * Aspect id of the aspect that register the template itself
   */
  aspectId: string;
}

export type ComponentConfig = { [aspectName: string]: any };

export interface ComponentTemplateOptions {
  /**
   * name of the component template. for example: `hook`, `react-component` or `module`.
   */
  name?: string;

  /**
   * display name of the template.
   */
  displayName?: string;

  /**
   * example name for the component template.
   */
  exampleComponentName?: string;

  /**
   * short description of the template. shown in the `bit templates` command.
   */
  description?: string;

  /**
   * hide this template so that it is not listed with `bit templates`
   */
  hidden?: boolean;

  /**
   * env to use for the generated component.
   */
  env?: string;

  /**
   * adds a metadata that the component that this template creates is of type env.
   * This will be used later to do further configuration for example:
   * - ensure to create the .bit_root for it
   */
  isEnv?: boolean;

  /**
   * adds a metadata that the component that this template creates is of type app.
   * This will be used later to do further configuration for example:
   * - add it to the workspace.jsonc as app
   * - ensure to create the .bit_root for it
   */
  isApp?: boolean;

  /**
   * list of dependencies to install when the component is created.
   */
  dependencies?: string[];

  /**
   * Perform installation of missing dependencies after component generation.
   * This is the same as of running `bit install --add-missing-deps` after component generation.
   */
  installMissingDependencies?: boolean;
}

/**
 * PromptOption is shown to the user before calling the generateFiles function.
 * The prompt is using enquirer under the hood. see https://www.npmjs.com/package/enquirer.
 * Examples:
 * - input: {name: 'name', message: 'enter your name', type: 'input'}
 * - confirm: {name: 'isHappy', message: 'are you happy?', type: 'confirm'}
 * - select: {name: 'color', message: 'pick a color', type: 'select', choices: ['red', 'blue', 'green']}
 */
export type PromptOption = {
  name: string;
  message: string;
  type: 'input' | 'confirm' | 'select';
  choices?: string[]; // for select type
  skip?: (previousResults: PromptResults) => boolean; // skip this prompt if this function returns true
};

/**
 * PromptResults is the result of the user input received from the promptOptions.
 * The key is the name of the prompt option and the value is the user input.
 * in case the prompt-option is of type 'confirm', the value will be a boolean.
 */
export type PromptResults = Record<string, string | boolean>;

export interface ComponentTemplate extends ComponentTemplateOptions {
  name: string;

  /**
   * in case the template requires user input, this function will be called to prompt the user.
   * the results will be passed to the generateFiles function.
   */
  promptOptions?: () => PromptOption[];

  /**
   * template function for generating the file of a certain component.,
   */
  generateFiles(context: ComponentContext): Promise<ComponentFile[]> | ComponentFile[];

  /**
   * component config. gets saved in the .bitmap file and it overrides the workspace.jsonc config.
   * for example, you can set the env that will be used for this component as follows:
   * "teambit.envs/envs": {
   *    "env": "teambit.harmony/aspect"
   * },
   */
  config?: ComponentConfig | ((context: ConfigContext) => ComponentConfig);
}

export type GetComponentTemplates = () => ComponentTemplate[];
