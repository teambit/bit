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
  CFG_REGISTRY_URL_KEY,
  PREVIOUSLY_DEFAULT_REGISTRY_URL
} from '../../constants';
import { LoginFailed } from '../exceptions';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';
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
        logger.errorAndAddBreadCrumb('login.loginToBitSrc', 'received non get request, closing connection');
        closeConnection();
        reject(new LoginFailed());
      }
      try {
        const { clientId, redirectUri, username, token } = url.parse(request.url, true).query || {};
        let writeToNpmrcError = false;
        if (clientGeneratedId !== clientId) {
          logger.errorAndAddBreadCrumb(
            'login.loginToBitSrc',
            'clientId mismatch, expecting: {clientGeneratedId} got {clientId}',
            { clientGeneratedId, clientId }
          );
          closeConnection(ERROR_RESPONSE);
          reject(new LoginFailed());
        }
        setSync(CFG_USER_TOKEN_KEY, token);
        const configuredRegistry = getSync(CFG_REGISTRY_URL_KEY);
        if (!skipRegistryConfig) {
          try {
            if (!configuredRegistry) {
              // some packages might have links in package-lock.json to the previous registry
              // this makes sure to have also the auth-token of the previous registry.
              // (the @bit:registry part points only to the current registry).
              actualNpmrcPath = driver.npmLogin(token, npmrcPath, PREVIOUSLY_DEFAULT_REGISTRY_URL);
            }
            actualNpmrcPath = driver.npmLogin(token, npmrcPath, configuredRegistry || DEFAULT_REGISTRY_URL);
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

    logger.debugAndAddBreadCrumb('login.loginToBitSrc', `initializing login server on port: ${port || DEFAULT_PORT}`);
    server.listen(port || DEFAULT_PORT, (err) => {
      if (err) {
        logger.errorAndAddBreadCrumb('login.loginToBitSrc', 'something bad happened', {}, err);
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
        reject(new GeneralError(`port: ${e.port} already in use, please run bit login --port <port>`));
      }
      reject(e);
    });
    return {};
  });
}
