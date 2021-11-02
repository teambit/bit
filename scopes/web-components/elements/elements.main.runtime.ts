import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { MainRuntime } from '@teambit/cli';
import ComponentAspect, { Component, ComponentMain } from '@teambit/component';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { ElementsArtifact } from './elements-artifact';
import { ElementsAspect } from './elements.aspect';
import { ElementsRoute } from './elements.route';
import { ElementTask } from './elements.task';

export class ElementsMain {
  constructor(private builder: BuilderMain) {}
  getElementsDirName(): string {
    // const envName = context.id.replace('/', '__');
    // const compName = componentId.toString().replace('/', '__');
    // return join(`${envName}-elements`, compName);
    return '__element';
  }

  createTask() {
    return new ElementTask(this);
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
