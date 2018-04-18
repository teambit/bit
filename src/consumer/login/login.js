import http from 'http';
import uniqid from 'uniqid';
import opn from 'opn';
import os from 'os';
import chalk from 'chalk';
import { setSync, getSync } from '../../api/consumer/lib/global-config';
import {
  CFG_BITSRC_TOKEN_KEY,
  CFG_USER_EMAIL_KEY,
  DEFAULT_HUB_LOGIN,
  CFG_HUB_LOGIN_KEY,
  CFG_BITSRC_USERNAME_KEY
} from '../../constants';
import { LoginFailed } from '../exceptions';
import logger from '../../logger/logger';

const ERROR_RESPONSE = 500;
const port = 8085;

export default function loginToBitSrc() {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    const clientId = uniqid();

    if (getSync(CFG_BITSRC_TOKEN_KEY)) return resolve({ isAlreadyLoggedIn: true });

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
      request.on('data', (data) => rawBody += data);
      request.on('end', function () {
        try {
          const body = JSON.parse(rawBody);
          if (clientId !== body.client_id) {
            logger.error(`clientId m expecting: ${clientId} got ${body.client_id}`);
            response.statusCode = ERROR_RESPONSE;
            closeConnection();
            return reject(new LoginFailed());
          }
          setSync(CFG_BITSRC_TOKEN_KEY, body.token.token);
          setSync(CFG_BITSRC_USERNAME_KEY, body.username);
          if (!getSync(CFG_USER_EMAIL_KEY)) setSync(CFG_BITSRC_TOKEN_KEY, body.email);
          closeConnection();
          return resolve({ username: body.username });
        } catch (err) {
          logger.err(`err on login: ${err}`);
          response.statusCode = ERROR_RESPONSE;
          closeConnection();
          return reject(new LoginFailed());
        }
      });
    };

    const server = http.createServer(requestHandler);

    server.listen(port, (err) => {
      if (err) {
        logger.error('something bad happened', err);
        reject(new LoginFailed());
      }

      const encoded = encodeURI(
        `${getSync(CFG_HUB_LOGIN_KEY) ||
          DEFAULT_HUB_LOGIN}?port=${port}&client_id=${clientId}&response_type=token&deviceName=${os.hostname()}&os=${
          process.platform
        }`
      );
      console.log(chalk.yellow(`Your browser has been opened to visit:\n${encoded}`));
      opn(encoded);
    });
  });
}
