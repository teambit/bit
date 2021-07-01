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
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { DocsAspect } from './docs.aspect';
import { DocsPreviewDefinition } from './docs.preview-definition';
import { docsSchema } from './docs.graphql';
import { DocReader } from './doc-reader';
import { DefaultDocReader } from './default-doc-reader';
import { FileExtensionNotSupported } from './exceptions';
import { Doc, DocPropList } from './doc';

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
    private patterns: string[],
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

    private docReaderSlot: DocReaderSlot
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
    const devFiles = this.devFiles.computeDevFiles(component);
    const docFiles = devFiles.get(DocsAspect.id);
    return component.state.filesystem.files.filter((file) => docFiles.includes(file.relative));
  }

  /**
   * compute the description of the component from its source code and docs file.
   */
  async getDescription(component: Component): Promise<string> {
    const componentDoc = this.getDoc(component);
    const desc = componentDoc?.description;
    if (desc) return desc;
    const consumerComponent: ConsumerComponent = component.state._consumer;
    const fromJsDocs = consumerComponent.docs?.find((doc) => doc.description);

    return fromJsDocs?.description || '';
  }

  async getTemplate(context: ExecutionContext) {
    return context.env.getDocsTemplate();
  }

  getDocReader(extension: string) {
    return this.docReaderSlot.values().find((docReader) => docReader.isFormatSupported(extension));
  }

  /**
   * compute a doc for a component.
   */
  async computeDoc(component: Component) {
    const docFiles = this.getDocsFiles(component);
    if (docFiles.length) {
      // currently taking the the first docs file found with an abstract. (we support only one)
      const docFile = docFiles[0];

      try {
        const docReader = this.getDocReader(docFile.extname);
        if (!docReader) throw new FileExtensionNotSupported(docFile.relative, docFile.extname);
        const doc = await docReader.read(docFile.relative, docFile.contents, component);
        return doc;
      } catch (err) {
        this.logger.error('docs.main.runtime.computeDoc caught an error', err);
        return null;
      }
    }

    return null;
  }

  getDoc(component: Component) {
    const docData = component.state.aspects.get(DocsAspect.id)?.data?.doc;
    if (!docData) return null;
    return new Doc(docData.filePath, new DocPropList(docData.props));
  }

  getPatterns() {
    return this.patterns;
  }

  /**
   * register a new doc reader. this allows to support further
   * documentation file formats.
   */
  registerDocReader(docReader: DocReader) {
    this.docReaderSlot.register(docReader);
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
    patterns: ['**/*.docs.*'],
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
    [docPropSlot, docReaderSlot]: [DocPropSlot, DocReaderSlot]
  ) {
    const logger = loggerAspect.createLogger(DocsAspect.id);
    const docs = new DocsMain(
      config.patterns,

      preview,

      pkg,

      compiler,

      workspace,

      logger,

      devFiles,

      docPropSlot,

      docReaderSlot
    );
    docs.registerDocReader(new DefaultDocReader(pkg, compiler, workspace));
    devFiles.registerDevPattern(config.patterns);

    if (workspace) {
      workspace.onComponentLoad(async (component) => {
        const doc = await docs.computeDoc(component);

        return {
          doc: doc?.toObject(),
        };
      });
    }

    graphql.register(docsSchema(docs));

    preview.registerDefinition(new DocsPreviewDefinition(docs));
    return docs;
  }
}

DocsAspect.addRuntime(DocsMain);
