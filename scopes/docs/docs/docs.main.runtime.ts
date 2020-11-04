import { resolve } from 'path';
import { MainRuntime } from '@teambit/cli';
import { LoggerAspect, LoggerMain, Logger } from '@teambit/logger';
import { CompilerAspect, CompilerMain } from '@teambit/compiler';
import ComponentAspect, { Component, ComponentMap } from '@teambit/component';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { ExecutionContext } from '@teambit/envs';
import { GraphqlAspect, GraphqlMain } from '@teambit/graphql';
import { PreviewAspect, PreviewMain } from '@teambit/preview';
import { AbstractVinyl } from 'bit-bin/dist/consumer/component/sources';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';
import { DocsAspect } from './docs.aspect';
import { DocModule } from './doc-module';
import { DocsPreviewDefinition } from './docs.preview-definition';
import { docsSchema } from './docs.graphql';

export type ComponentDocs = {
  files: string[];
  component: Component;
};

export type DocsConfig = {
  /**
   * regex for detection of documentation files
   */
  extension: string;
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

    private logger: Logger
  ) {}

  /**
   * returns an array of doc file paths for a set of components.
   */
  getDocsMap(components: Component[]): ComponentMap<AbstractVinyl[]> {
    return ComponentMap.as<AbstractVinyl[]>(components, (component) => {
      return component.state.filesystem.byRegex(/\.docs\.[tj]sx?$/);
    });
  }

  getDocsFiles(component: Component): AbstractVinyl[] {
    return component.state.filesystem.byRegex(/\.docs\.[tj]sx?$/);
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

  static runtime = MainRuntime;
  static dependencies = [
    PreviewAspect,
    GraphqlAspect,
    WorkspaceAspect,
    PkgAspect,
    CompilerAspect,
    LoggerAspect,
    ComponentAspect,
  ];

  static async provider([preview, graphql, workspace, pkg, compiler, loggerAspect]: [
    PreviewMain,
    GraphqlMain,
    Workspace,
    PkgMain,
    CompilerMain,
    LoggerMain
  ]) {
    const logger = loggerAspect.createLogger(DocsAspect.id);
    const docs = new DocsMain(preview, pkg, compiler, workspace, logger);

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
