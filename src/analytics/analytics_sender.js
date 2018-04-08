import requestify from 'requestify';
import { getSync } from '../api/consumer/lib/global-config';
import logger from '../logger/logger';
import { DEFAULT_ANALYTICS_DOMAIN, CFG_ANALYTICS_DOMAIN_KEY } from '../constants';

const ANALYTICS_DOMAIN = getSync(CFG_ANALYTICS_DOMAIN_KEY) || DEFAULT_ANALYTICS_DOMAIN;

process.on('message', (msg) => {
  return requestify
    .post(ANALYTICS_DOMAIN, msg, { timeout: 1000 })
    .fail(err => logger.error(`failed sending anonymous usage: ${err.body}`));
});
