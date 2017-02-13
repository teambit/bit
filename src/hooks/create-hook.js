/* @flow */
import R from 'ramda';
import { get } from '../api/consumer/lib/global-config';
import client from './http-client/client';

const createHook = (hookNameKey: string, methodName: string): () => Promise<any> => {
  methodName = R.toUpper(methodName);
  return (data: ?Object|string): Promise<?any> => {
    return new Promise((resolve) => {
      return get(hookNameKey)
        .then((destUrl) => {
          if (!destUrl) return resolve();

          return client[methodName](destUrl, data)
          .then(() => resolve())
          .catch(() => resolve());
        });
    });
  };
};

export default createHook;
