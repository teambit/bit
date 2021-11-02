import camelCase from 'camelcase';
import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { WebpackConfigTransformer } from '@teambit/webpack';
import { ElementsArtifact } from './elements-artifact';
import { ElementsAspect } from './elements.aspect';
import { ElementsRoute } from './elements.route';
import { ElementTask } from './elements.task';

export class ElementsMain {
  constructor(private builder: BuilderMain) {}
  getElementsDirName(): string {
    return '__element';
  }

  createTask() {
    return new ElementTask(this);
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
    const artifacts = await this.builder.getArtifactsVinylByExtension(component, ElementsAspect.id);
    if (!artifacts.length) return undefined;

    return new ElementsArtifact(artifacts);
  }

  static slots = [];
  static dependencies = [ComponentAspect, BuilderAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([componentExtension, builder, loggerMain]: [ComponentMain, BuilderMain, LoggerMain]) {
    const elements = new ElementsMain(builder);
    const logger = loggerMain.createLogger(ElementsAspect.id);
    const elementsRoute = new ElementsRoute(elements, logger);
    componentExtension.registerRoute([elementsRoute]);
    return elements;
  }
}

ElementsAspect.addRuntime(ElementsMain);
