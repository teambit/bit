import http from 'http';
import uniqid from 'uniqid';
import opn from 'opn';
import os from 'os';
import chalk from 'chalk';
import { setSync, getSync } from '../../api/consumer/lib/global-config';
import {
  CFG_BITSRC_TOKEN_KEY,
  CFG_USER_EMAIL_KEY,
  CFG_USER_NAME_KEY,
  DEFAULT_HUB_LOGIN,
  CFG_HUB_LOGIN_KEY
} from '../../constants';
import { LoginFailed } from '../exceptions';
import logger from '../../logger/logger';

const ERROR_RESPONSE = 500;
const port = 8085;

export default function loginToBitSrc() {
  return new Promise((resolve, reject) => {
    let rawBody = '';
    const clientId = uniqid();

    const requestHandler = (request, response) => {
      const closeConnection = () => {
        response.end();
        server.close();
      };

      if (request.method !== 'POST') {
        logger.error('recieved non post request, closing connection');
        closeConnection();
        reject(new LoginFailed());
      }
      request.on('data', (data) => {
        rawBody += data;
      });
      request.on('end', function () {
        try {
          const body = JSON.parse(rawBody);
          if (clientId !== body.client_id) {
            logger.error(`clientId missmatch expecting: ${clientId} got ${body.client_id}`);
            response.statusCode = ERROR_RESPONSE;
            closeConnection();
            return reject(new LoginFailed());
          }
          setSync(CFG_BITSRC_TOKEN_KEY, body.token.token);
          if (!getSync(CFG_USER_EMAIL_KEY)) setSync(CFG_BITSRC_TOKEN_KEY, body.email);
          if (!getSync(CFG_USER_NAME_KEY)) setSync(CFG_BITSRC_TOKEN_KEY, body.username);
        } catch (err) {
          logger.err(`err on login: ${err}`);
          response.statusCode = ERROR_RESPONSE;
          closeConnection();
          return reject(new LoginFailed());
        }
        closeConnection();
        return resolve(getSync(CFG_USER_NAME_KEY));
      });
    };

    const server = http.createServer(requestHandler);

    server.listen(port, (err) => {
      if (err) {
        reject(console.log('something bad happened', err));
      }

      const encoded = encodeURI(
        `${getSync(CFG_HUB_LOGIN_KEY) ||
          DEFAULT_HUB_LOGIN}?redirect_uri=http://localhost:${port}&client_id=${clientId}&response_type=token&deviceName=${os.hostname()}&os=${
          process.platform
        }`
      );
      console.log(chalk.yellow(`Your browser has been opened to visit:\n${encoded}`));
      opn(encoded);
    });
  });
}
