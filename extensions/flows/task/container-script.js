/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable global-require */
/* eslint-disable no-console */
/* eslint-disable import/no-dynamic-require */

function handleError(error) {
  process && process.send ? process.send({ error }) : console.error(error);
  process.exit(1);
}

const pathToTask = process.argv.find(function (value, index, arr) {
  if (!index) {
    return false;
  }
  return __filename.endsWith(arr[index - 1]);
});

let userTask;
try {
  userTask = require(pathToTask);
} catch (e) {
  handleError(new Error('script-container can not find user task'));
}

const toExecute = userTask.default || userTask;

if (typeof toExecute === 'function') {
  const getPromisedResult = () => {
    const executed = toExecute();
    return executed && executed.then ? executed : Promise.resolve(executed);
  };
  getPromisedResult()
    .then((userTaskResult) => {
      process.on('beforeExit', async (code) => {
        const toSend = userTaskResult || { exitCode: code };
        process.send ? process.send(toSend) : Promise.resolve();
      });
    })
    .catch(handleError);
}
