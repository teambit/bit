import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import { MainRuntime } from '@teambit/cli';
import type { LoggerMain, Logger } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import type { Component, IComponent } from '@teambit/component';
import { ComponentMap } from '@teambit/component';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { PkgMain } from '@teambit/pkg';
import { PkgAspect } from '@teambit/pkg';
import type { Environment, EnvsMain } from '@teambit/envs';
import type { GraphqlMain } from '@teambit/graphql';
import { GraphqlAspect } from '@teambit/graphql';
import type { PreviewMain } from '@teambit/preview';
import { PreviewAspect } from '@teambit/preview';
import type { DevFilesMain } from '@teambit/dev-files';
import { DevFilesAspect } from '@teambit/dev-files';
import type { ComponentLoadOptions } from '@teambit/legacy.consumer-component';
import type { AbstractVinyl } from '@teambit/component.sources';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { Doc, DocPropList } from '@teambit/docs.entities.doc';
import { isFunction } from 'lodash';
import { EnvsAspect } from '@teambit/envs';
import { DocsAspect } from './docs.aspect';
import { DocsPreviewDefinition } from './docs.preview-definition';
import { docsSchema } from './docs.graphql';
import type { DocReader } from './doc-reader';
import { DefaultDocReader } from './default-doc-reader';
import { FileExtensionNotSupported } from './exceptions';

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

    private envs: EnvsMain,

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
    const devFiles = this.devFiles.getDevFiles(component);
    const docFiles = devFiles.get(DocsAspect.id);
    return component.state.filesystem.files.filter((file) => docFiles.includes(file.relative));
  }

  /**
   * compute the description of the component from its source code and docs file.
   */
  async getDescription(component: Component): Promise<string> {
    const componentDoc = this.getDoc(component);
    const desc = componentDoc?.description;
    return desc || '';
  }

  async getTemplate(env: Environment): Promise<string | undefined> {
    if (env.getDocsTemplate && isFunction(env.getDocsTemplate)) {
      return env.getDocsTemplate();
    }
    return undefined;
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
      } catch (err: any) {
        // it's ok to fail here.
        this.logger.debug(`docs.main.runtime.computeDoc caught an error: ${err.message}`);
        return null;
      }
    }

    return null;
  }

  getDoc(component: IComponent) {
    const docData = component.get(DocsAspect.id)?.data?.doc;
    if (!docData) return null;
    return new Doc(docData.filePath, new DocPropList(docData.props));
  }

  getPatterns() {
    return this.patterns;
  }

  getComponentDevPatterns(component: Component) {
    const env = this.envs.calculateEnv(component, { skipWarnings: !!this.workspace?.inInstallContext }).env;
    const componentEnvDocsDevPatterns: string[] = env.getDocsDevPatterns ? env.getDocsDevPatterns(component) : [];
    const componentPatterns = componentEnvDocsDevPatterns.concat(this.getPatterns());
    return { name: 'docs', pattern: componentPatterns };
  }

  getDevPatternToRegister() {
    return this.getComponentDevPatterns.bind(this);
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
    EnvsAspect,
    ScopeAspect,
  ];

  static defaultConfig = {
    patterns: ['**/*.docs.*'],
  };

  static async provider(
    [preview, graphql, workspace, pkg, compiler, loggerAspect, devFiles, envs, scope]: [
      PreviewMain,
      GraphqlMain,
      Workspace,
      PkgMain,
      CompilerMain,
      LoggerMain,
      DevFilesMain,
      EnvsMain,
      ScopeMain,
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
      envs,
      docPropSlot,
      docReaderSlot
    );
    docs.registerDocReader(new DefaultDocReader(pkg, compiler, workspace));
    devFiles.registerDevPattern(docs.getDevPatternToRegister());

    const computeDocsOnLoad = async (component: Component, opts?: ComponentLoadOptions) => {
      if (opts?.loadDocs === false) return undefined;
      // const docFiles = await docs.computeDocs(component);
      const doc = await docs.computeDoc(component);

      return {
        doc: doc?.toObject(),
        // docFiles
      };
    };

    if (workspace) {
      workspace.registerOnComponentLoad(computeDocsOnLoad);
    }
    if (scope) {
      scope.registerOnCompAspectReCalc(computeDocsOnLoad);
    }

    graphql.register(() => docsSchema(docs));

    preview.registerDefinition(new DocsPreviewDefinition(docs));
    return docs;
  }
}

DocsAspect.addRuntime(DocsMain);
