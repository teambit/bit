/* eslint max-classes-per-file: 0 */
import path from 'path';
import Vinyl from 'vinyl';
import { ExtensionManifest, Harmony } from '@teambit/harmony';
import { Workspace } from '../workspace';
import { BitId } from '../../bit-id';
import { composeComponentPath } from '../../utils/bit/compose-component-path';
import DataToPersist from '../../consumer/component/sources/data-to-persist';
import { AbstractVinyl } from '../../consumer/component/sources';
import { PathOsBasedRelative } from '../../utils/path';
import { AddActionResults } from '../../consumer/component-ops/add-components/add-components';
import { CreateExtConfig } from './types';

type TemplateFile = { path: string; content: string };
type TemplateFuncResult = { files: TemplateFile[]; main?: string };
type TemplateFunc = (...args: string[]) => TemplateFuncResult;
export class Create {
  constructor(private config: CreateExtConfig, private workspace: Workspace, private registry: Registry) {}

  register(manifest: ExtensionManifest, template: TemplateFunc) {
    this.registry.set(manifest, template);
    return this;
  }

  async create(name: string): Promise<AddActionResults> {
    const templateExtName = this.config?.template;
    if (!templateExtName) {
      throw new Error(`please add the following configuration: "create: { "template": "your-template-extension" }" `);
    }
    const templateFunc = this.registry.get(templateExtName);

    const nameSplit = name.split('/');
    const compName = nameSplit.pop(); // last item is the name, the rest are the namespace
    const templateResults = this.getTemplateResults(templateFunc, compName as string, templateExtName);
    const componentPath = this.getComponentPath(name);
    await this.writeComponentFiles(componentPath, templateResults.files);
    return this.workspace.add([componentPath], name, templateResults.main);
  }

  private getComponentPath(name: string) {
    return composeComponentPath(new BitId({ name }), this.workspace.legacyDefaultDirectory);
  }

  private getTemplateResults(templateFunc: Function, compName: string, templateExtName: string): TemplateFuncResult {
    if (typeof templateFunc !== 'function') {
      throw new Error(
        `failed to get a template function from "${templateExtName}. got ${typeof templateFunc} instead"`
      );
    }
    try {
      return templateFunc(compName);
    } catch (err) {
      throw new Error(`got an error "${err.message}" while running the template function of ${templateExtName}.`);
    }
  }

  /**
   * writes the generated template files to the default directory set in the workspace config
   */
  private async writeComponentFiles(
    componentPath: string,
    templateFiles: TemplateFile[]
  ): Promise<PathOsBasedRelative[]> {
    const dataToPersist = new DataToPersist();
    const vinylFiles = templateFiles.map(templateFile => {
      const templateFileVinyl = new Vinyl({
        base: componentPath,
        path: path.join(componentPath, templateFile.path),
        contents: Buffer.from(templateFile.content)
      });
      return AbstractVinyl.fromVinyl(templateFileVinyl);
    });
    const results = vinylFiles.map(v => v.path);
    dataToPersist.addManyFiles(vinylFiles);
    dataToPersist.addBasePath(this.workspace.path);
    await dataToPersist.persistAllToFS();
    return results;
  }
}

const DEFAULT_TEMPLATE = name => [
  { path: `${name}.js`, content: `export default function ${name} { console.log('I am the default template'); }` }
];

export class Registry {
  constructor(private harmony: Harmony) {}

  private templates = {};

  /**
   * get a template from the registry.
   */
  get(name: string) {
    const scripts = this.templates[name];
    if (!scripts) throw new Error('no scripts found');
    return this.templates[name] || DEFAULT_TEMPLATE;
  }

  /**
   * set a script to the registry.
   */
  set(manifest: ExtensionManifest, templateFunc: TemplateFunc) {
    // TODO: is this really needed? maybe it's just a template name and not must be a real extension id / manifest?
    // TODO: why we need to fetch it from harmony at all?
    // const extensionConfig = this.harmony.config.get(manifest.name);
    // if (!extensionConfig) throw new Error(manifest.name);
    if (!this.templates[manifest.name]) this.templates[manifest.name] = {};
    this.templates[manifest.name] = templateFunc;
    return this;
  }
}
