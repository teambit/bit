// @flow
// TODO - move to language specific driver.
import { testInProcess } from '../api/consumer/lib/test';

const testOneComponent = verbose => async (id: string) => {
  const res = await testInProcess(id, verbose);
  return res[0];
};

const ids = process.env.__ids__ ? process.env.__ids__.split() : undefined;
const verbose: boolean = process.env.__verbose__ === true;

const testAllP = ids.map(testOneComponent(verbose));
Promise.all(testAllP).then((results) => {
  const serializedResults = serializeResults(results);
  process.send(serializedResults);
});

function serializeResults(results) {
  return results;
}
