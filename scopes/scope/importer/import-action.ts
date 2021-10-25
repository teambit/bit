import { Workspace } from '@teambit/workspace';
import R from 'ramda';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import ImportComponents, { ImportOptions } from '@teambit/legacy/dist/consumer/component-ops/import-components';

export async function importAction(workspace: Workspace, importOptions: ImportOptions, packageManagerArgs: string[]) {
  const consumer = workspace.consumer;
  consumer.packageManagerArgs = packageManagerArgs;
  const importComponents = new ImportComponents(consumer, importOptions);
  const { dependencies, envComponents, importDetails } = await importComponents.importComponents();
  const bitIds = dependencies.map(R.path(['component', 'id']));
  Analytics.setExtraData('num_components', bitIds.length);
  await consumer.onDestroy();
  return { dependencies, envComponents, importDetails };
}
