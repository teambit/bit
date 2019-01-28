import requestify from 'requestify';

// const apiBaseUrl = process.env.NODE_ENV === 'production' ? 'https://api.bitsrc.io' : 'https://api-stg.bitsrc.io';
const isAppVeyor = process.env.APPVEYOR === 'True';
const supportTestingOnBitsrc = !isAppVeyor;
// const supportTestingOnBitsrc = true;
const apiBaseUrl = process.env.BITSRC_ENV === 'stg' ? 'https://api-stg.bitsrc.io' : 'https://api.bitsrc.io';
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
          cocyclesSession: res
            .getHeader('set-cookie')[0]
            .split(';')[0]
            .split('cocyclesSession=')[1]
        };
      })
      .catch((err) => {
        console.log('Error from BitSrc Server', err); // eslint-disable-line no-console
        throw new Error(`Failed to login into ${apiBaseUrl}`);
      });
  }

  loginToBitSrc() {
    return this.init().then((cookies) => {
      this.cookies = cookies;
    });
  }

  generateRandomName() {
    const randomName = Math.random()
      .toString(36)
      .substr(2, 5);
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
