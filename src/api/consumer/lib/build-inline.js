/** @flow */
import { loadConsumer } from '../../../consumer';
import Component from '../../../consumer/component';
import InlineId from '../../../consumer/bit-inline-id';

function buildImplAndSpecP(inlineId: InlineId, consumer, component: Component):
Promise<?Array<?string>> {
  const bitPath = inlineId.composeBitPath(consumer.getPath());
  const saveImplDist = component.dist ?
    component.dist.write(bitPath, component.implFile) : null;

  const saveSpecDist = component.specDist ?
    component.specDist.write(bitPath, component.specsFile) : null;

  return Promise.all([saveImplDist, saveSpecDist]);
}

export function buildInline(id: string): Promise<?Array<string>> {
  const inlineId = InlineId.parse(id);
  return loadConsumer()
    .then((consumer) => {
      return consumer.loadComponent(inlineId)
      .then((component) => {
        return component.build({ scope: consumer.scope, consumer })
        .then((result) => {
          if (result === null) return Promise.resolve(null);
          return buildImplAndSpecP(inlineId, consumer, component);
        });
      });
    });
}

export function buildInlineAll(): Promise<Object> {
  return loadConsumer().then((consumer) => {
    return consumer.listInline().then((components) => {
      const buildAll = components.map((component) => {
        return component.build({ scope: consumer.scope, consumer })
          .then((result) => {
            const inlineId = new InlineId({ box: component.box, name: component.name });
            if (result === null) {
              return Promise.resolve({ component: inlineId.toString(), buildResults: null });
            }
            return buildImplAndSpecP(inlineId, consumer, component)
              .then(buildResults => ({ component: inlineId.toString(), buildResults }));
          });
      });
      return Promise.all(buildAll).then((allComponents) => {
        const componentsObj = {};
        allComponents.forEach((component) => {
          componentsObj[component.component] = component.buildResults;
        });
        return componentsObj;
      });
    });
  });
}
