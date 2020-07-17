/* eslint no-console: 0 */
import requestify from 'requestify';
import { getSync } from '../api/consumer/lib/global-config';
import { DEFAULT_ANALYTICS_DOMAIN, CFG_ANALYTICS_DOMAIN_KEY } from '../constants';

const ANALYTICS_DOMAIN = getSync(CFG_ANALYTICS_DOMAIN_KEY) || DEFAULT_ANALYTICS_DOMAIN;
/**
 * to debug errors here, first, change the parent to have { silent: false }, in analytics.js `fork` call.
 */
process.on('message', (msg) => {
  // needed for the parent to make sure the child got the message
  // without it, when the message is large, the parent exits before it totally sent
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  process.send('Got the message');

  return requestify
    .post(ANALYTICS_DOMAIN, msg, { timeout: 1000 })
    .then(() => {
      console.log('message has been sent');
      process.exit();
    })
    .fail((err) => {
      console.error('failed to send the message', err);
      process.exit();
    });
});

setTimeout(() => {
  console.log('exit due to timeout');
  process.exit();
}, 5000);
