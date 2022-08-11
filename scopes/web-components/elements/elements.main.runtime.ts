import camelCase from 'camelcase';
import { ArtifactStorageResolver, BuilderAspect, BuilderMain } from '@teambit/builder';
import { MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { WebpackConfigTransformer } from '@teambit/webpack';
import GraphqlAspect, { GraphqlMain } from '@teambit/graphql';
import { ElementsArtifact } from './elements-artifact';
import { ElementsAspect } from './elements.aspect';
import { ElementsRoute } from './elements.route';
import { ElementTask } from './elements.task';
import { elementsSchema } from './elemets.graphql';

export class ElementsMain {
  constructor(private builder: BuilderMain, private componentExtension: ComponentMain) {}
  baseRoute = `elements/`;

  getElementsDirName(): string {
    return '__bit__elements';
  }

  createTask(storageResolver?: ArtifactStorageResolver) {
    return new ElementTask(this, storageResolver);
  }

  getWebpackTransformers(): WebpackConfigTransformer[] {
    const defaultTransformer: WebpackConfigTransformer = (configMutator, context) => {
      const defaultBundlePrefix = ElementsArtifact.defaultMainFilePrefix;
      const namePascalCase = camelCase(context.target.components[0].id.name, { pascalCase: true });
      configMutator.raw.output = configMutator.raw.output || {};
      configMutator.raw.output.filename = `static/js/${defaultBundlePrefix}.[contenthash:8].js`;
      configMutator.raw.output.library = {
        name: namePascalCase,
        type: 'umd',
      };
      return configMutator;
    };
    return [defaultTransformer];
  }

  async getElements(component: Component): Promise<ElementsArtifact | undefined> {
    const artifacts = await this.builder.getArtifactsVinylByAspect(component, ElementsAspect.id);
    if (!artifacts.length) return undefined;

    return new ElementsArtifact(artifacts);
  }

  isElementsExist(component: Component): boolean {
    const artifacts = this.builder.getArtifactsByAspect(component, ElementsAspect.id);
    return !artifacts.isEmpty();
  }

  async getElementUrl(component: Component): Promise<string | undefined> {
    const artifacts = await this.getElements(component);
    // In case there are no elements return as undefined
    if (!artifacts) return undefined;
    if (artifacts?.isEmpty()) return undefined;

    const url = artifacts?.getMainElementsFileUrl();
    // In case of public url (like cdn) return the public url
    if (url) {
      return url;
    }
    // return the url in the scope
    return this.componentExtension.getRoute(component.id, this.baseRoute);
  }

  static slots = [];
  static dependencies = [ComponentAspect, BuilderAspect, LoggerAspect, GraphqlAspect];
  static runtime = MainRuntime;
  static async provider([componentExtension, builder, loggerMain, graphql]: [
    ComponentMain,
    BuilderMain,
    LoggerMain,
    GraphqlMain
  ]) {
    const elements = new ElementsMain(builder, componentExtension);
    const logger = loggerMain.createLogger(ElementsAspect.id);
    const elementsRoute = new ElementsRoute(elements, logger);
    graphql.register(elementsSchema(elements));
    componentExtension.registerRoute([elementsRoute]);
    return elements;
  }
}

ElementsAspect.addRuntime(ElementsMain);
