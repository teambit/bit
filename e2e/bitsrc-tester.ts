import requestify from 'requestify';
import { BASE_WEB_DOMAIN } from '../src/constants';

// const apiBaseUrl = process.env.NODE_ENV === 'production' ? `https://api.${BASE_WEB_DOMAIN}` : `https://api-stg.${BASE_WEB_DOMAIN}`;
const isAppVeyor = process.env.APPVEYOR === 'True';
const skipBitDevTests = process.env.SKIP_BIT_DEV_TESTS === 'True' || process.env.SKIP_BIT_DEV_TESTS === 'true';
const supportTestingOnBitsrc = !isAppVeyor && !skipBitDevTests;
// const supportTestingOnBitsrc = true;
const apiBaseUrl =
  process.env.BITSRC_ENV === 'stg' ? `https://api-stg.${BASE_WEB_DOMAIN}` : `https://api.${BASE_WEB_DOMAIN}`;
const username = process.env.testerBitsrcUsername || 'tester';
const password = process.env.testerBitsrcPassword;

export { username, supportTestingOnBitsrc };
const debugMode = !!process.env.npm_config_debug;
export default class BitsrcTester {
  cookies;

  init() {
    if (!supportTestingOnBitsrc) throw new Error('supportTestingOnBitsrc is set to false');
    return requestify
      .post(`${apiBaseUrl}/user/login`, { username, password })
      .then((res) => {
        return {
          cocyclesSession: getSession(res.getHeader('set-cookie')),
        };
      })
      .catch((err) => {
        console.log('Error from BitSrc Server', err); // eslint-disable-line no-console
        throw new Error(`Failed to login into ${apiBaseUrl}`);
      });
    function getSession(cookies) {
      const sessionPart = cookies.find((str) => str.includes('cocyclesSession'));
      if (!sessionPart) {
        throw new Error(`Failed to authenticate to ${apiBaseUrl}, the "cocyclesSession" was not found`);
      }
      const cocyclesSessionPart = sessionPart.split(';');
      const cocyclesSession = cocyclesSessionPart.find((str) => str.includes('cocyclesSession'));
      return cocyclesSession.replace('cocyclesSession=', '');
    }
  }

  loginToBitSrc() {
    return this.init().then((cookies) => {
      this.cookies = cookies;
    });
  }

  generateRandomName() {
    const randomName = Math.random().toString(36).substr(2, 5);
    return `ci-${randomName}`;
  }

  createScope(scope = this.generateRandomName()) {
    if (debugMode) {
      console.log(`creating scope on bitsrc ${scope}`); // eslint-disable-line no-console
    }
    return requestify
      .request(`${apiBaseUrl}/scope/`, { method: 'POST', cookies: this.cookies, body: { scope, private: true } })
      .then(() => scope)
      .catch((res) => {
        throw new Error(`Failed to create scope with error: ${res.getBody().message}`);
      });
  }

  deleteScope(scope) {
    if (debugMode) {
      console.log(`deleting scope on bitsrc ${scope}`); // eslint-disable-line no-console
    }
    return requestify
      .request(`${apiBaseUrl}/scope/`, { method: 'DELETE', cookies: this.cookies, body: { scope } })
      .catch((res) => {
        throw new Error(`Failed to delete scope with error: ${res.getBody().message}`);
      });
  }
}
