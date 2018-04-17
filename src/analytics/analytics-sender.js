import requestify from 'requestify';
import { getSync } from '../api/consumer/lib/global-config';
import { DEFAULT_ANALYTICS_DOMAIN, CFG_ANALYTICS_DOMAIN_KEY } from '../constants';

const ANALYTICS_DOMAIN = getSync(CFG_ANALYTICS_DOMAIN_KEY) || DEFAULT_ANALYTICS_DOMAIN;

process.on('message', (msg) => {
  return requestify
    .post(ANALYTICS_DOMAIN, msg, { timeout: 1000 })
    .then(() => process.exit())
    .fail(() => process.exit());
});

setTimeout(() => {
  process.exit();
}, 5000);
