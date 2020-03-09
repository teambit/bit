/* eslint max-classes-per-file: 0 */
import path from 'path';
import { Workspace } from '../workspace';
import { ExtensionManifest, Harmony } from '../../harmony';
import { BitId } from '../../bit-id';
import { composeComponentPath } from '../../utils/bit/compose-component-path';
import DataToPersist from '../../consumer/component/sources/data-to-persist';
import { AbstractVinyl } from '../../consumer/component/sources';
import { PathOsBasedRelative } from '../../utils/path';
import { AddActionResults } from '../../consumer/component-ops/add-components/add-components';

type TemplateFile = { path: string; content: string };
type TemplateFuncResult = { files: TemplateFile[]; main?: string };
type TemplateFunc = (...args: string[]) => TemplateFuncResult;

export class TemplateFileVinyl extends AbstractVinyl {}

export class Create {
  constructor(private workspace: Workspace, private registry: Registry) {}

  register(manifest: ExtensionManifest, template: TemplateFunc) {
    this.registry.set(manifest, template);
    return this;
  }

  async create(name: string): Promise<AddActionResults> {
    const templateExtName = this.workspace.config.extensions.create?.template;
    if (!templateExtName) {
      throw new Error(`please add the following configuration: "create: { "template": "your-template-extension" }" `);
    }
    const templateFunc = this.registry.get(templateExtName);

    const nameSplit = name.split('/');
    const compName = nameSplit.pop(); // last item is the name, the rest are the namespace
    const templateResults = this.getTemplateResults(templateFunc, compName as string, templateExtName);
    const writtenFiles = await this.writeComponentFiles(name, templateResults.files);
    return this.workspace.add(writtenFiles, name, templateResults.main);
  }

  private getComponentPath(name: string) {
    return composeComponentPath(new BitId({ name }), this.workspace.config.componentsDefaultDirectory);
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
  private async writeComponentFiles(name: string, templateFiles: TemplateFile[]): Promise<PathOsBasedRelative[]> {
    const componentPath = this.getComponentPath(name);
    const dataToPersist = new DataToPersist();
    const vinylFiles = templateFiles.map(templateFile => {
      const templateFileVinyl = new TemplateFileVinyl({
        base: componentPath,
        path: path.join(componentPath, templateFile.path),
        contents: Buffer.from(templateFile.content)
      });
      return templateFileVinyl;
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
  constructor(private harmony: Harmony<unknown>) {}

  private templates = {};

  /**
   * get a template from the registry.
   */
  get(name: string) {
    const scripts = this.templates[name];
    if (!scripts) throw new Error();
    return this.templates[name] || DEFAULT_TEMPLATE;
  }

  /**
   * set a script to the registry.
   */
  set(manifest: ExtensionManifest, templateFunc: TemplateFunc) {
    const extension = this.harmony.get(manifest.name);
    if (!extension) throw new Error(manifest.name);
    if (!this.templates[extension.name]) this.templates[extension.name] = {};
    this.templates[extension.name] = templateFunc;
    return this;
  }
}
