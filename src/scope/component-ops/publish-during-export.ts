import { BitId } from '../../bit-id';
import logger from '../../logger/logger';
import { loadConsumer } from '../../consumer';

export type PublishResults = {
  publishedComponents: {
    id: BitId;
    package: string;
  }[];
  failedComponents: {
    id: BitId;
    errors: string[];
  }[];
};

export type PublishPostExportResult = {
  id: BitId;
  data: string | undefined;
  errors: string[];
};

export async function publishComponentsToRegistry({
  newIdsOnRemote,
  updatedIds
}: {
  newIdsOnRemote: BitId[];
  updatedIds: BitId[];
}): Promise<PublishResults> {
  const consumer = await loadConsumer();
  let postExportResults;
  try {
    postExportResults = await Promise.all(consumer.scope.onPostExport.map(func => func(newIdsOnRemote)));
  } catch (err) {
    const publishErr = `The components ${updatedIds.map(c => c.toString()).join(', ')} were exported successfully.
    However, the publish operation has failed due to an error: ${err.msg || err}`;
    logger.error(publishErr, err);
    throw new Error(publishErr);
  }
  const publishPostExport: PublishPostExportResult[] = postExportResults[0]; // as of now, this is the only function running on PostExport
  const publishResults: PublishResults = { publishedComponents: [], failedComponents: [] };
  publishPostExport.forEach(component => {
    if (component.errors.length) {
      publishResults.failedComponents.push({ id: component.id, errors: component.errors });
    } else if (component.data) {
      publishResults.publishedComponents.push({ id: component.id, package: component.data });
    }
  });

  return publishResults;
}
