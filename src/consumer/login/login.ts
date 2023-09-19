import chalk from 'chalk';
import http from 'http';
import open from 'open';
import os from 'os';
import url from 'url';
import { v4 } from 'uuid';

import { getSync, setSync } from '../../api/consumer/lib/global-config';
import { CFG_USER_TOKEN_KEY, getLoginUrl, CFG_CLOUD_DOMAIN_KEY } from '../../constants';
import GeneralError from '../../error/general-error';
import logger from '../../logger/logger';
import { LoginFailed } from '../exceptions';

const ERROR_RESPONSE = 500;
const DEFAULT_PORT = 8085;
const REDIRECT = 302;

export default function loginToCloud(
  port: string,
  suppressBrowserLaunch: boolean,
  machineName: string | null | undefined,
  cloudDomain?: string
): Promise<{
  isAlreadyLoggedIn?: boolean;
  username?: string;
  npmrcPath?: string;
}> {
  return new Promise((resolve, reject) => {
    const clientGeneratedId = v4();
    if (getSync(CFG_USER_TOKEN_KEY)) {
      return resolve({
        isAlreadyLoggedIn: true,
      });
    }
    const server = http.createServer((request, response) => {
      const closeConnection = (statusCode?: number) => {
        if (statusCode) response.statusCode = statusCode;
        response.end();
        server.close();
      };
      if (request.method !== 'GET') {
        logger.errorAndAddBreadCrumb('login.loginToCloud', 'received non get request, closing connection');
        closeConnection();
        reject(new LoginFailed());
      }
      try {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const { clientId, redirectUri, username, token } = url.parse(request.url, true).query || {};
        if (clientGeneratedId !== clientId) {
          logger.errorAndAddBreadCrumb(
            'login.loginToCloud',
            'clientId mismatch, expecting: {clientGeneratedId} got {clientId}',
            { clientGeneratedId, clientId }
          );
          closeConnection(ERROR_RESPONSE);
          reject(new LoginFailed());
        }
        setSync(CFG_USER_TOKEN_KEY, token as string);
        if (cloudDomain) {
          setSync(CFG_CLOUD_DOMAIN_KEY, cloudDomain);
        }

        response.writeHead(REDIRECT, {
          Location: redirectUri,
        });
        closeConnection();
        resolve({
          username,
        });
      } catch (err: any) {
        logger.error(`err on login: ${err}`);
        closeConnection(ERROR_RESPONSE);
        reject(new LoginFailed());
      }
    });

    logger.debugAndAddBreadCrumb('login.loginToCloud', `initializing login server on port: ${port || DEFAULT_PORT}`);
    // @ts-ignore
    server.listen(port || DEFAULT_PORT, (err: Error) => {
      if (err) {
        logger.errorAndAddBreadCrumb('login.loginToCloud', 'something bad happened', {}, err);
        reject(new LoginFailed());
      }

      const loginUrl = getLoginUrl(cloudDomain);

      const encoded = encodeURI(
        `${loginUrl}?port=${port || DEFAULT_PORT}&clientId=${clientGeneratedId}&responseType=token&deviceName=${
          machineName || os.hostname()
        }&os=${process.platform}`
      );
      if (!suppressBrowserLaunch) {
        console.log(chalk.yellow(`Your browser has been opened to visit:\n${encoded}`)); // eslint-disable-line no-console
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        open(encoded, { url: true });
      } else {
        console.log(chalk.yellow(`Go to the following link in your browser::\n${encoded}`)); // eslint-disable-line no-console
      }
    });

    server.on('error', (e) => {
      // @ts-ignore
      if (e.code === 'EADDRINUSE') {
        // @ts-ignore
        reject(new GeneralError(`port: ${e.port} already in use, please run bit login --port <port>`));
      }
      reject(e);
    });
    return {};
  });
}
