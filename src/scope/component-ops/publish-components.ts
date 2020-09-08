// import { BitId } from '../../bit-id';
// import { Consumer } from '../../consumer';
// import logger from '../../logger/logger';

// export type PublishResults = {
//   publishedComponents: {
//     id: BitId;
//     package: string;
//   }[];
//   failedComponents: {
//     id: BitId;
//     errors: string[]; // from npm-register command
//   }[];
//   exception?: Error; // an exception was thrown during the hook run (not npm-publish related)
// };

// export type PublishPostTagResult = {
//   id: BitId;
//   data: string | undefined;
//   errors: string[];
// };

// export async function publishComponentsToRegistry(consumer: Consumer, taggedIds: BitId[]): Promise<PublishResults> {
//   let postPersistTagResults;
//   logger.debug(`publishComponentsToRegistry, running onPostPersistTag on ${taggedIds.length} components`);
//   if (!consumer.scope.onPostPersistTag.length) {
//     logger.error('publishComponentsToRegistry, onPostPersistTag is empty');
//   }
//   const publishResults: PublishResults = { publishedComponents: [], failedComponents: [] };
//   try {
//     postPersistTagResults = await Promise.all(consumer.scope.onPostPersistTag.map((func) => func(taggedIds)));
//   } catch (err) {
//     let errMessage = err.report && typeof err.report === 'function' ? err.report() : undefined;
//     errMessage = errMessage || err.message || err.msg || err;
//     const publishErr = `The components ${taggedIds.map((c) => c.toString()).join(', ')} were tagged successfully.
//     However, the publish operation has failed due to an error: ${errMessage}`;
//     logger.error(publishErr, err);
//     publishResults.exception = new Error(publishErr);
//     return publishResults;
//   }
//   const publishPostTag: PublishPostTagResult[] = postPersistTagResults[0]; // as of now, this is the only function running on postPersistTag
//   publishPostTag.forEach((component) => {
//     if (component.errors.length) {
//       publishResults.failedComponents.push({ id: component.id, errors: component.errors });
//     } else if (component.data) {
//       publishResults.publishedComponents.push({ id: component.id, package: component.data });
//     }
//   });

//   return publishResults;
// }
