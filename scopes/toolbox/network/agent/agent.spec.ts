import path from 'path';
import { getAgent } from './agent';

test('getAgent reads cafile', () => {
  const agent = getAgent('https://node.bit.cloud', {
    cafile: path.join(__dirname, 'fixtures/cafile.txt'),
  });
  expect(agent['options'].ca).toStrictEqual([
    `-----BEGIN CERTIFICATE-----
XXXX
-----END CERTIFICATE-----`,
    `-----BEGIN CERTIFICATE-----
YYYY
-----END CERTIFICATE-----`,
    `-----BEGIN CERTIFICATE-----
ZZZZ
-----END CERTIFICATE-----`,
  ]);
});
