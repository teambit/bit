/** @flow */
import http from 'http';
import uuid from 'uuid';
import opn from 'opn';
import os from 'os';
import chalk from 'chalk';
import url from 'url';
import { setSync, getSync } from '../../api/consumer/lib/global-config';
import { CFG_USER_TOKEN_KEY, DEFAULT_HUB_LOGIN, CFG_HUB_LOGIN_KEY } from '../../constants';
import { LoginFailed } from '../exceptions';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';

const ERROR_RESPONSE = 500;
const DEFAULT_PORT = 8085;
const REDIRECT = 302;

export default function loginToBitSrc(
  port: string,
  noLaunchBrowser?: boolean
): Promise<{ isAlreadyLoggedIn?: boolean, username?: string }> {
  return new Promise((resolve, reject) => {
    const clientGeneratedId = uuid();
    if (getSync(CFG_USER_TOKEN_KEY)) {
      // $FlowFixMe
      return resolve({ isAlreadyLoggedIn: true });
    }
    const server = http.createServer((request, response) => {
      const closeConnection = (statusCode?: number) => {
        if (statusCode) response.statusCode = statusCode;
        response.end();
        server.close();
      };
      if (request.method !== 'GET') {
        logger.error('received non post request, closing connection');
        closeConnection();
        reject(new LoginFailed());
      }
      try {
        const { clientId, redirectUri, username, token } = url.parse(request.url, true).query || {};
        const queryData = url.parse(request.url, true).query || {};
        if (clientGeneratedId !== clientId) {
          logger.error(`clientId mismatch, expecting: ${clientId} got ${queryData.clientId}`);
          closeConnection(ERROR_RESPONSE);
          reject(new LoginFailed());
        }
        setSync(CFG_USER_TOKEN_KEY, token);
        response.writeHead(REDIRECT, { Location: redirectUri });
        closeConnection();
        resolve({ username });
      } catch (err) {
        logger.err(`err on login: ${err}`);
        closeConnection(ERROR_RESPONSE);
        reject(new LoginFailed());
      }
    });

    server.listen(port || DEFAULT_PORT, (err) => {
      if (err) {
        logger.error('something bad happened', err);
        reject(new LoginFailed());
      }

      const encoded = encodeURI(
        `${getSync(CFG_HUB_LOGIN_KEY) ||
          DEFAULT_HUB_LOGIN}?port=${DEFAULT_PORT}&clientId=${clientGeneratedId}&responseType=token&deviceName=${os.hostname()}&os=${
          process.platform
        }`
      );
      if (!noLaunchBrowser) {
        console.log(chalk.yellow(`Your browser has been opened to visit:\n${encoded}`)); // eslint-disable-line no-console
        opn(encoded);
      } else {
        console.log(chalk.yellow(`Go to the following link in your browser::\n${encoded}`)); // eslint-digit sable-line no-console
      }
    });

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        reject(new GeneralError(`port: ${e.port} alredy in use, please run bit login --port <port>`));
      }
      reject(e);
    });
    return {};
  });
}
