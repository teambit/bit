/** @flow */
import path from 'path';
import fs from 'fs';
import { loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';
import { BitId } from '../../../bit-id';
import ComponentsList from '../../../consumer/component/components-list';




  function buildImplAndSpecP(consumer, component: Component):
  Promise<?Array<?string>> {
    const saveDist = component.dist.map(distFile => distFile.write());

    return Promise.all(saveDist);
  }

  export async function build(id: string): Promise<?Array<string>> {
    const bitId = BitId.parse(id);
    const consumer = await loadConsumer();
    const component: Component = await consumer.loadComponent(bitId);
    const result = await component.build({ scope: consumer.scope, consumer });
    if (result === null) return null;
    return buildImplAndSpecP(consumer, component);
  }

  async function buildAllResults(components, consumer) {
    return components.map(async (component) => {
      const result = await component.build({ scope: consumer.scope, consumer });
      const bitId = new BitId({ box: component.box, name: component.name });
      if (result === null) {
        return { component: bitId.toString(), buildResults: null };
      }
      const buildResults = await buildImplAndSpecP(bitId, consumer, component);
      return { component: bitId.toString(), buildResults };
    });
  }

  export async function buildAll(): Promise<Object> {
    const consumer = await loadConsumer();
    const componentsList = new ComponentsList(consumer);
    const newAndModifiedComponents = await componentsList.newAndModifiedComponents();
    const buildAllP = await buildAllResults(newAndModifiedComponents, consumer);
    const allComponents = await Promise.all(buildAllP);
    const componentsObj = {};
    allComponents.forEach((component) => {
      componentsObj[component.component] = component.buildResults;
    });
    return componentsObj;
  }
