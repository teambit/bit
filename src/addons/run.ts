import { Pipe } from './pipe';
import { RunOptions } from './run-configuration';
import { loadConsumer } from '../consumer';
import { BitId, BitIds } from '../bit-id';
import Component from '../consumer/component/consumer-component';
import { COMPONENT_ORIGINS } from '../constants';
import { BitCapsule } from '../capsule';

export async function run(options: RunOptions): Promise<any> {
  const consumer = await loadConsumer();
  let components: Component[] = [];
  if (options.id) {
    const id = BitId.parse(options.id);
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

  await Promise.all(
    components.map(async component => {
      const pipe: Pipe | String = options.extensions.length ? new Pipe() : (options.step! as string);
      const actualPipe: Pipe = typeof pipe === 'string' ? getComponentPipe(component, pipe)! : (pipe as Pipe);
      try {
        const capsule = getCapsule();
        debugger;
        console.log('Yo!');
        await actualPipe.run({ component, capsule });
      } catch (e) {
        throw e;
      }
    })
  );
}

function getComponentPipe(component: Component, pipe: string): Pipe | undefined {
  return component.getPipeRegistry()[pipe];
}

function getCapsule() {
  return {} as BitCapsule;
}
