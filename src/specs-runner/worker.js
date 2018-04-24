// @flow
// TODO - move to language specific driver.
import { testInProcess } from '../api/consumer/lib/test';

const testOneComponent = verbose => async (id: string) => {
  const res = await testInProcess(id, verbose);
  return res[0];
};

function run() {
  const ids = process.env.__ids__ ? process.env.__ids__.split() : undefined;
  const verbose: boolean = process.env.__verbose__ === true;
  if (!ids || !ids.length) {
    return process.send([]);
  }
  const testAllP = ids.map(testOneComponent(verbose));
  Promise.all(testAllP).then((results) => {
    const serializedResults = serializeResults(results);
    return process.send(serializedResults);
  });
}

run();

function serializeResults(results) {
  return results;
}
