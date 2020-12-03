import { resolve } from 'path';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import ComponentAspect, { Component, ComponentMap } from '@teambit/component';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { ExecutionContext } from '@teambit/envs';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { PreviewAspect, PreviewMain } from '@teambit/preview';
import DevFilesAspect, { DevFilesMain } from '@teambit/dev-files';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { DocsAspect } from './docs.aspect';
import { DocModule } from './doc-module';
import { DocsPreviewDefinition } from './docs.preview-definition';
import { docsSchema } from './docs.graphql';
import { DocReader } from './doc-reader';

export type ComponentDocs = {
  files: string[];
  component: Component;
};

export type DocProp = {};

export type DocPropSlot = SlotRegistry<DocProp>;

export type DocReaderSlot = SlotRegistry<DocReader>;

export type DocsConfig = {
  /**
   * glob patterns to identify doc files.
   */
  patterns: string[];
};

/**
 * the component documentation extension.
 */
export class DocsMain {
  constructor(
    /**
     * envs extension.
     */
    private preview: PreviewMain,

    private pkg: PkgMain,

    private compiler: CompilerMain,

    private workspace: Workspace,

    private logger: Logger,

    private devFiles: DevFilesMain,

    private docPropSlot: DocPropSlot,

    private docReader: DocReaderSlot
  ) {}

  /**
   * returns an array of doc file paths for a set of components.
   */
  getDocsMap(components: Component[]): ComponentMap<AbstractVinyl[]> {
    return ComponentMap.as<AbstractVinyl[]>(components, (component) => {
      return this.getDocsFiles(component);
    });
  }

  getDocsFiles(component: Component): AbstractVinyl[] {
    const devFiles = this.devFiles.getDevFiles(component);
    const docFiles = devFiles.get(DocsAspect.id);
    return component.state.filesystem.files.filter((file) => docFiles.includes(file.relative));
  }

  /**
   * get the description of the component.
   */
  getDescription(component: Component): string {
    const defaultDesc = '';
    const entry = component.state.aspects.get(DocsAspect.id);
    if (!entry) return defaultDesc;
    const description = entry.data.description;
    return description || defaultDesc;
  }

  /**
   * get the docs module of a component if exists.
   */
  async readDocs(component: Component): Promise<DocModule | null> {
    const docFiles = this.getDocsFiles(component);
    if (docFiles.length !== 0) {
      // currently taking the the first docs file found with an abstract. (we support only one)
      try {
        const packageName = this.pkg.getPackageName(component);
        const docsFilePath = docFiles[0].relative;
        const distPath = this.compiler.getDistPathBySrcPath(component, docsFilePath);
        // eslint-disable-next-line
        const docsModule = require(resolve(`${this.workspace.path}/node_modules/${packageName}/${distPath}`));
        return new DocModule(docsModule, docsModule);
      } catch (err) {
        this.logger.error(`failed loading doc for component ${component.id.toString()}. got error: ${err.toString()}`, [
          err,
        ]);

        return null;
      }
    }

    return null;
  }

  /**
   * compute the description of the component from its source code and docs file.
   */
  async computeDescription(component: Component): Promise<string> {
    const componentDoc = await this.readDocs(component);
    if (componentDoc?.abstract) return componentDoc.abstract;
    const consumerComponent: ConsumerComponent = component.state._consumer;
    const fromJsDocs = consumerComponent.docs?.find((doc) => doc.description);

    return fromJsDocs?.description || '';
  }

  async getTemplate(context: ExecutionContext) {
    return context.env.getDocsTemplate();
  }

  computeDocProps(component: Component) {
    const docFiles = this.getDocsFiles(component);
    if (docFiles.length) {
      // currently taking the the first docs file found with an abstract. (we support only one)
      const docFile = docFiles[0];
      docFile.dirname;
    }

    return null;
  }

  /**
   * register a new documentation property. this property will be parse and extracted
   * from the configured doc format.
   */
  registerDocProperty(docProp: DocProp) {
    this.docPropSlot.register(docProp);
    return this;
  }

  registerDocReader(docReader: DocReader) {
    this.docReader.register(docReader);
    return this;
  }

  static slots = [Slot.withType<DocProp>(), Slot.withType<DocReader>()];

  static runtime = MainRuntime;
  static dependencies = [
    PreviewAspect,
    GraphqlAspect,
    WorkspaceAspect,
    PkgAspect,
    CompilerAspect,
    LoggerAspect,
    DevFilesAspect,
    ComponentAspect,
  ];

  static defaultConfig = {
    patterns: ['*.docs.*'],
  };

  static async provider(
    [preview, graphql, workspace, pkg, compiler, loggerAspect, devFiles]: [
      PreviewMain,
      GraphqlMain,
      Workspace,
      PkgMain,
      CompilerMain,
      LoggerMain,
      DevFilesMain
    ],
    config: DocsConfig,
    [docPropSlot, docReader]: [DocPropSlot, DocReaderSlot]
  ) {
    const logger = loggerAspect.createLogger(DocsAspect.id);
    const docs = new DocsMain(preview, pkg, compiler, workspace, logger, devFiles, docPropSlot, docReader);
    devFiles.registerDevPattern(config.patterns);

    if (workspace) {
      workspace.onComponentLoad(async (component) => {
        const description = await docs.computeDescription(component);

        return {
          description,
        };
      });
    }

    graphql.register(docsSchema(docs));

    preview.registerDefinition(new DocsPreviewDefinition(docs));
    return docs;
  }
}

DocsAspect.addRuntime(DocsMain);
