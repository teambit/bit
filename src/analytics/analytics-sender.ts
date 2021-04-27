/* eslint-disable no-console */
import fetch from 'node-fetch';

import { getSync } from '../api/consumer/lib/global-config';
import { CFG_ANALYTICS_DOMAIN_KEY, DEFAULT_ANALYTICS_DOMAIN } from '../constants';

const ANALYTICS_DOMAIN = getSync(CFG_ANALYTICS_DOMAIN_KEY) || DEFAULT_ANALYTICS_DOMAIN;
/**
 * to debug errors here, first, change the parent to have { silent: false }, in analytics.js `fork` call.
 */
// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('message', (msg) => {
  // needed for the parent to make sure the child got the message
  // without it, when the message is large, the parent exits before it totally sent
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  process.send('Got the message');
  const body = JSON.stringify(msg);
  return fetch(ANALYTICS_DOMAIN, {
    timeout: 1000,
    method: 'post',
    body,
    headers: {
      'Content-Type': 'application/json',
    },
  })
    .then((res) => {
      if (res.ok) {
        // res.status >= 200 && res.status < 300
        console.log('message has been sent');
        process.exit();
      } else {
        console.error('failed to send the message', res.statusText);
        process.exit();
      }
    })
    .catch((err) => {
      console.error('failed to send the message', err);
      process.exit();
    });
});

setTimeout(() => {
  console.log('exit due to timeout');
  process.exit();
}, 5000);
