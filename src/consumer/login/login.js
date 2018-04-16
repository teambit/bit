import http from 'http';
import uniqid from 'uniqid';
import opn from 'opn';
import os from 'os';
import chalk from 'chalk';
import { setSync, getSync } from '../../api/consumer/lib/global-config';
import { CFG_BITSRC_TOKEN_KEY, CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY } from '../../constants';
import { LoginFailed } from '../exceptions';
import logger from '../../logger/logger';

export default function loginToBitSrc() {
  const port = 8085;
  return new Promise((resolve, reject) => {
    let rawBody = '';
    const client_id = uniqid();
    const requestHandler = (request, response) => {
      if (request.method !== 'POST') {
        server.close();
        logger.error('recieved non post request, closing connection');
        reject(new LoginFailed());
      }
      request.on('data', (data) => {
        rawBody += data;
      });
      request.on('end', function () {
        try {
          const body = JSON.parse(rawBody);
          if (client_id !== body.client_id) {
            response.end();
            server.close();
            return reject(new LoginFailed());
          }
          setSync(CFG_BITSRC_TOKEN_KEY, body.token.token);
          if (!getSync(CFG_USER_EMAIL_KEY)) setSync(CFG_BITSRC_TOKEN_KEY, body.email);
          if (!getSync(CFG_USER_NAME_KEY)) setSync(CFG_BITSRC_TOKEN_KEY, body.username);
        } catch (err) {
          logger.err(`login failed: ${err}`);
          request.end();
          server.close();
          return reject(new LoginFailed());
        }
        response.end();
        server.close();
        return resolve(chalk.green('login successful!!!!'));
      });
    };

    const server = http.createServer(requestHandler);

    server.listen(port, (err) => {
      if (err) {
        reject(console.log('something bad happened', err));
      }

      const encoded = encodeURI(
        `https://bitsrc.io/login?redirect_uri=https://localhost:${port}&client_id=${client_id}&response_type=token&deviceName=${os.hostname()}&os=${
          process.platform
        }`
      );
      console.log(`Your browser has been opened to visit: ${encoded}`);
      opn(encoded);
    });
  });
}
