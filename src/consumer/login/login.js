import http from 'http';
import uniqid from 'uniqid';
import opn from 'opn';
import url from 'url';
import os from 'os';
import { setSync, getSync } from '../../api/consumer/lib/global-config';
import { CFG_BITSRC_TOKEN_KEY, CFG_USER_EMAIL_KEY, CFG_USER_NAME_KEY } from '../../constants';
import { LoginFailed } from '../exceptions';

export default function loginToBitSrc() {
  const port = 8085;
  return new Promise((resolve, reject) => {
    const client_id = uniqid();
    const requestHandler = (request, response) => {
      response.end();
      const parsed = url.parse(request.url, true);
      const params = parsed.query;
      if (client_id !== params.client_id) {
        server.close();
        reject(new LoginFailed());
      }

      setSync(CFG_BITSRC_TOKEN_KEY, params.token);
      if (!getSync(CFG_USER_EMAIL_KEY)) setSync(CFG_BITSRC_TOKEN_KEY, params.email);
      if (!getSync(CFG_USER_NAME_KEY)) setSync(CFG_BITSRC_TOKEN_KEY, params.username);
      return resolve(server.close());
    };

    const server = http.createServer(requestHandler);

    server.listen(port, (err) => {
      if (err) {
        reject(console.log('something bad happened', err));
      }

      const encoded = encodeURI(
        `https://bitsrc.io/login?redirect_uri=http://localhost:${port}&client_id=${client_id}&response_type=token&deviceName=${os.hostname()}&os=${
          process.platform
        }`
      );
      console.log(`Your browser has been opened to visit: ${encoded}`);
      opn(encoded);
    });
  });
}
