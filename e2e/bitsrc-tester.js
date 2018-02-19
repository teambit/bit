import requestify from 'requestify';

// const apiBaseUrl = process.env.NODE_ENV === 'production' ? 'https://api.bitsrc.io' : 'https://api-stg.bitsrc.io';
const apiBaseUrl = 'https://api.bitsrc.io';
const username = process.env.testerBitsrcUsername || 'tester';
const password = process.env.testerBitsrcPassword;

export { username };

export default class BitsrcTester {
  cookies;

  init() {
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
    return requestify
      .request(`${apiBaseUrl}/scope/`, { method: 'POST', cookies: this.cookies, body: { scope, private: true } })
      .then(() => scope)
      .catch((res) => {
        throw new Error(`Failed to create scope with error: ${res.getBody().message}`);
      });
  }

  deleteScope(scope) {
    return requestify
      .request(`${apiBaseUrl}/scope/`, { method: 'DELETE', cookies: this.cookies, body: { scope } })
      .catch((res) => {
        throw new Error(`Failed to delete scope with error: ${res.getBody().message}`);
      });
  }
}
