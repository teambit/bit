/** @flow */
import http from 'http';
import uuid from 'uuid';
import opn from 'opn';
import os from 'os';
import chalk from 'chalk';
import url from 'url';
import { setSync, getSync } from '../../api/consumer/lib/global-config';
import {
  CFG_USER_TOKEN_KEY,
  DEFAULT_HUB_LOGIN,
  CFG_HUB_LOGIN_KEY,
  DEFAULT_LANGUAGE,
  DEFAULT_REGISTRY_URL,
  CFG_REGISTRY_URL_KEY
} from '../../constants';
import { LoginFailed } from '../exceptions';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';
import { Analytics } from '../../analytics/analytics';
import { Driver } from '../../driver';

const ERROR_RESPONSE = 500;
const DEFAULT_PORT = 8085;
const REDIRECT = 302;

export default function loginToBitSrc(
  port: string,
  suppressBrowserLaunch?: boolean,
  npmrcPath: string,
  skipRegistryConfig: boolean
): Promise<{
  isAlreadyLoggedIn?: boolean,
  username?: string
}> {
  let actualNpmrcPath = npmrcPath;
  return new Promise((resolve, reject) => {
    const clientGeneratedId = uuid();
    const driver = Driver.load(DEFAULT_LANGUAGE);
    if (getSync(CFG_USER_TOKEN_KEY)) {
      // $FlowFixMe
      return resolve({
        isAlreadyLoggedIn: true
      });
    }
    const server = http.createServer((request, response) => {
      const closeConnection = (statusCode?: number) => {
        if (statusCode) response.statusCode = statusCode;
        response.end();
        server.close();
      };
      if (request.method !== 'GET') {
        logger.error('received non get request, closing connection');
        closeConnection();
        reject(new LoginFailed());
      }
      try {
        const { clientId, redirectUri, username, token } = url.parse(request.url, true).query || {};
        let writeToNpmrcError = false;
        if (clientGeneratedId !== clientId) {
          logger.error(`clientId mismatch, expecting: ${clientGeneratedId} got ${clientId}`);
          closeConnection(ERROR_RESPONSE);
          reject(new LoginFailed());
        }
        setSync(CFG_USER_TOKEN_KEY, token);
        if (!skipRegistryConfig) {
          try {
            actualNpmrcPath = driver.npmLogin(token, npmrcPath, getSync(CFG_REGISTRY_URL_KEY) || DEFAULT_REGISTRY_URL);
          } catch (e) {
            actualNpmrcPath = e.path;
            writeToNpmrcError = true;
          }
        }

        response.writeHead(REDIRECT, {
          Location: redirectUri
        });
        closeConnection();
        resolve({
          username,
          npmrcPath: actualNpmrcPath,
          writeToNpmrcError
        });
      } catch (err) {
        logger.err(`err on login: ${err}`);
        closeConnection(ERROR_RESPONSE);
        reject(new LoginFailed());
      }
    });

    Analytics.addBreadCrumb('login', `initializing login server  on port: ${port || DEFAULT_PORT}`);
    server.listen(port || DEFAULT_PORT, (err) => {
      if (err) {
        logger.error('something bad happened', err);
        reject(new LoginFailed());
      }

      const encoded = encodeURI(
        `${getSync(CFG_HUB_LOGIN_KEY) || DEFAULT_HUB_LOGIN}?port=${port ||
          DEFAULT_PORT}&clientId=${clientGeneratedId}&responseType=token&deviceName=${os.hostname()}&os=${
          process.platform
        }`
      );
      if (!suppressBrowserLaunch) {
        console.log(chalk.yellow(`Your browser has been opened to visit:\n${encoded}`)); // eslint-disable-line no-console
        opn(encoded);
      } else {
        console.log(chalk.yellow(`Go to the following link in your browser::\n${encoded}`)); // eslint-disable-line no-console
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
