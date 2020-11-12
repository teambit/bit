import { init } from './full-harmony-bootstrap';

import type { CreateWorkerOptions } from '../worker.main.runtime';
const serializedParams = process.argv.slice(2).pop();
if (!serializedParams) {
  throw new Error('No parameters found');
}

const options: CreateWorkerOptions = JSON.parse(serializedParams);

init()
  .then((harmony) => {
    const mainAspect = harmony!.get<any>(options.aspectId);
    return mainAspect;
  })
  .then((mainAspect) => {
    return mainAspect[options.execMethodName].apply(mainAspect, options.params);
  })
  .then((results) => {
    // console.log(results);
    // // https://github.com/nodejs/node/issues/22088
    // setInterval(() => {}, 5000);
  });
