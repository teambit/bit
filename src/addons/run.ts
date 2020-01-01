import plimit from 'p-limit';
import { Pipe } from './pipe';
import { RunOptions } from './run-configuration';
import { loadConsumer } from '../consumer';
import Component from '../consumer/component/consumer-component';
import { COMPONENT_ORIGINS } from '../constants';
import CapsuleBuilder from '../environment/capsule-builder';

export async function run(options: RunOptions): Promise<any> {
  const consumer = await loadConsumer();
  let components: Component[] = [];
  if (options.id) {
    const id = consumer.getParsedId(options.id);
    const component = await consumer.loadComponent(id);
    components.push(component);
  } else {
    const authoredComponentsIDs = consumer.bitMap.getAllBitIds([COMPONENT_ORIGINS.AUTHORED]);
    const importedComponentsIDs = consumer.bitMap.getAllBitIds([COMPONENT_ORIGINS.IMPORTED]);
    components = (await consumer.loadComponents(authoredComponentsIDs, false)).components;
    const loadedImported = (await consumer.loadComponents(importedComponentsIDs)).components;
    const componentWithCorrectPipe = options.extensions.length
      ? loadedImported
      : loadedImported.filter(component => !!getComponentPipe(component, options.step!));
    components.push(...componentWithCorrectPipe);
  }
  const build = new CapsuleBuilder(consumer.getPath());
  console.time('isolate');
  const capsules = await build.isolateComponents(
    consumer,
    components.map(comp => comp.id),
    { baseDir: '/tmp/ninja', installPackages: true }
  );
  console.timeEnd('isolate');
  const limit = plimit(7);
  console.time('compile');
  debugger;
  await Promise.all(
    components.map(async component => {
      const pipe: Pipe | String = options.extensions.length ? new Pipe() : (options.step! as string);
      const actualPipe: Pipe = typeof pipe === 'string' ? getComponentPipe(component, pipe)! : (pipe as Pipe);
      const capsule = capsules[component.id.toString()];
      return limit(async function() {
        try {
          await actualPipe.run({ component, capsule });
        } catch (e) {
          console.log(`component`, component.name, 'failed');
          return Promise.resolve();
        }
      });
    })
  );
  console.timeEnd('compile');
}

function getComponentPipe(component: Component, pipe: string): Pipe | undefined {
  return component.getPipeRegistry()[pipe];
}
