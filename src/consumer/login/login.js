/** @flow */
import http from 'http';
import uniqid from 'uniqid';
import opn from 'opn';
import os from 'os';
import chalk from 'chalk';
import { setSync, getSync } from '../../api/consumer/lib/global-config';
import {
  CFG_USER_TOKEN_KEY,
  CFG_USER_EMAIL_KEY,
  DEFAULT_HUB_LOGIN,
  CFG_HUB_LOGIN_KEY,
  CFG_USER_NAME_KEY
} from '../../constants';
import { LoginFailed } from '../exceptions';
import logger from '../../logger/logger';
import GeneralError from '../../error/general-error';

const ERROR_RESPONSE = 500;
const PORT = 8085;

export default function loginToBitSrc(
  port: string,
  noLaunchBrowser?: boolean
): Promise<{ isAlreadyLoggedIn?: boolean, username?: string }> {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    const clientId = uniqid();

    if (getSync(CFG_USER_TOKEN_KEY)) {
      // $FlowFixMe
      return resolve({ isAlreadyLoggedIn: true });
    }

    const requestHandler = (request, response) => {
      const closeConnection = () => {
        response.end();
        server.close();
      };

      if (request.method !== 'POST') {
        logger.error('received non post request, closing connection');
        closeConnection();
        reject(new LoginFailed());
      }
      request.on('error', (data) => {
        rawBody += data;
      });
      request.on('data', (data) => {
        rawBody += data;
      });
      request.on('end', function () {
        try {
          const body = JSON.parse(rawBody);
          if (clientId !== body.client_id) {
            logger.error(`clientId mismatch expecting: ${clientId} got ${body.client_id}`);
            response.statusCode = ERROR_RESPONSE;
            closeConnection();
            reject(new LoginFailed());
          }
          setSync(CFG_USER_TOKEN_KEY, body.token.token);
          if (!getSync(CFG_USER_NAME_KEY)) setSync(CFG_USER_NAME_KEY, body.username);
          if (!getSync(CFG_USER_EMAIL_KEY)) setSync(CFG_USER_TOKEN_KEY, body.email);
          closeConnection();
          resolve({ username: body.username });
        } catch (err) {
          logger.err(`err on login: ${err}`);
          response.statusCode = ERROR_RESPONSE;
          closeConnection();
          reject(new LoginFailed());
        }
      });
    };

    const server = http.createServer(requestHandler);

    server.listen(port || PORT, (err) => {
      if (err) {
        logger.error('something bad happened', err);
        reject(new LoginFailed());
      }

      const encoded = encodeURI(
        `${getSync(CFG_HUB_LOGIN_KEY) ||
          DEFAULT_HUB_LOGIN}?port=${PORT}&client_id=${clientId}&response_type=token&deviceName=${os.hostname()}&os=${
          process.platform
        }`
      );
      if (!noLaunchBrowser) {
        console.log(chalk.yellow(`Your browser has been opened to visit:\n${encoded}`));
        opn(encoded);
      } else {
        console.log(chalk.yellow(`Go to the following link in your browser::\n${encoded}`));
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
