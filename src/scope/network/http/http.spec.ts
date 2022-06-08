import { expect } from 'chai';
import path from 'path';
import { Http } from './http';

it('should read ca from file', () => {
  expect(Http.getCA({
    'proxy.cafile': path.join(__dirname, 'fixtures/ca-file1.txt'),
  })).to.eql([`-----BEGIN CERTIFICATE-----
XXXX
-----END CERTIFICATE-----`,
    `-----BEGIN CERTIFICATE-----
YYYY
-----END CERTIFICATE-----`,
    `-----BEGIN CERTIFICATE-----
ZZZZ
-----END CERTIFICATE-----`,
  ]);
})
