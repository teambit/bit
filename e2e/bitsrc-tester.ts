import fetch from 'node-fetch';

import { BASE_CLOUD_DOMAIN } from '../src/constants';

// const apiBaseUrl = process.env.NODE_ENV === 'production' ? `https://api.${BASE_CLOUD_DOMAIN}` : `https://api-stg.${BASE_CLOUD_DOMAIN}`;
const skipBitDevTests = process.env.SKIP_BIT_DEV_TESTS === 'True' || process.env.SKIP_BIT_DEV_TESTS === 'true';
console.log('🚀 ~ file: bitsrc-tester.ts ~ line 7 ~ skipBitDevTests', skipBitDevTests);
const supportTestingOnBitsrc = !skipBitDevTests;
console.log('🚀 ~ file: bitsrc-tester.ts ~ line 9 ~ supportTestingOnBitsrc', supportTestingOnBitsrc);
// const supportTestingOnBitsrc = true;
const apiBaseUrl =
  process.env.BITSRC_ENV === 'stg' ? `https://api-stg.${BASE_CLOUD_DOMAIN}` : `https://api.${BASE_CLOUD_DOMAIN}`;
console.log('🚀 ~ file: bitsrc-tester.ts ~ line 12 ~ apiBaseUrl', apiBaseUrl);
const username = process.env.testerBitsrcUsername || 'tester';
const password = process.env.testerBitsrcPassword;

export { username, supportTestingOnBitsrc };
const debugMode = !!process.env.npm_config_debug;
export default class BitsrcTester {
  cookies;

  init() {
    if (!supportTestingOnBitsrc) throw new Error('supportTestingOnBitsrc is set to false');
    return fetch(`${apiBaseUrl}/user/login`, {
      method: 'post',
      body: JSON.stringify({ username, password }),
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((res) => {
        return getSession(res.headers.raw()['set-cookie']);
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
      return cocyclesSession;
    }
  }

  loginToBitSrc() {
    return this.init().then((cookies) => {
      this.cookies = cookies;
    });
  }

  generateRandomName() {
    const randomName = Math.random().toString(36).slice(2, 7);
    return `ci-${randomName}`;
  }

  createScope(scope = this.generateRandomName()) {
    if (debugMode) {
      console.log(`creating scope on bitsrc ${scope}`); // eslint-disable-line no-console
    }
    const headers = {
      'Content-Type': 'application/json',
      cookie: this.cookies,
    };
    return fetch(`${apiBaseUrl}/scope/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ scope, private: true }),
    }).then((res) => {
      if (res.ok) {
        // res.status >= 200 && res.status < 300
        return scope;
      }
      throw new Error(`Failed to create scope with error ${res.statusText}`);
    });
  }

  deleteScope(scope) {
    if (debugMode) {
      console.log(`deleting scope on bitsrc ${scope}`); // eslint-disable-line no-console
    }
    const headers = {
      'Content-Type': 'application/json',
      cookie: this.cookies,
    };
    return fetch(`${apiBaseUrl}/scope/`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ scope }),
    }).then((res) => {
      if (res.ok) {
        // res.status >= 200 && res.status < 300
        return res.json();
      }
      throw new Error(`Failed to delete scope with error ${res.statusText}`);
    });
  }
}
