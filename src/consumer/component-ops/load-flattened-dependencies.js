// @flow
import R from 'ramda';
import Component from '../component/consumer-component';
import ComponentWithDependencies from '../../scope/component-dependencies';
import { Consumer } from '..';
import BitIds from '../../bit-id/bit-ids';

export default (async function loadFlattenedDependencies(
  consumer: Consumer,
  component: Component
): Promise<ComponentWithDependencies> {
  const { components: dependencies } = await consumer.loadComponents(component.dependencies.getAllIds());
  const { components: devDependencies } = await consumer.loadComponents(component.devDependencies.getAllIds());
  const { components: compilerDependencies } = await consumer.loadComponents(
    component.compilerDependencies.getAllIds()
  );
  const { components: testerDependencies } = await consumer.loadComponents(component.testerDependencies.getAllIds());

  await loadFlattenedRecursively(dependencies);
  await loadFlattenedRecursively(devDependencies);
  await loadFlattenedRecursively(compilerDependencies);
  await loadFlattenedRecursively(testerDependencies);

  return new ComponentWithDependencies({
    component,
    dependencies,
    devDependencies,
    compilerDependencies,
    testerDependencies
  });

  async function loadFlattenedRecursively(components: Component[]) {
    if (R.isEmpty(components)) return;
    const currentIds = BitIds.fromArray(components.map(c => c.id));
    const ids = R.flatten(components.map(c => c.dependencies.getAllIds()));
    const idsUniq = BitIds.fromArray(ids).getUniq();
    const newIds = idsUniq.filter(id => !currentIds.has(id));
    if (R.isEmpty(newIds)) return;
    const { components: deps } = await consumer.loadComponents(newIds);
    if (R.isEmpty(deps)) return;
    components.push(...deps);
    await loadFlattenedRecursively(components);
  }
});
