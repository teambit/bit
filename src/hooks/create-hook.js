/* @flow */
import R from 'ramda';
import { get } from '../api/consumer/lib/global-config';
import client from './http-client/client';
import logger from '../logger/logger';

const createHook = (hookNameKey: string, methodName: string): () => Promise<any> => {
  logger.debug(`Planning to run a hook ${hookNameKey} with a method ${methodName}`);
  methodName = R.toUpper(methodName);
  return (data: ?Object|string): Promise<?any> => {
    return new Promise((resolve) => {
      return get(hookNameKey)
        .then((destUrl) => {
          if (!destUrl) {
            logger.warn(`Failed running the ${hookNameKey} hook as destUrl is not set in the config file`);
            return resolve();
          }
          logger.debug(`Running the ${hookNameKey} hook with destUrl: ${destUrl}, and data: ${data}`);
          return client[methodName](destUrl, data)
          .then(() => {
            logger.debug(`Successfully ran hook ${hookNameKey}`);
            return resolve();
          })
          .catch((err) => {
            logger.warn(`Failed running the hook ${hookNameKey}. Error: ${err}`);
            return resolve();
          });
        });
    });
  };
};

export default createHook;
