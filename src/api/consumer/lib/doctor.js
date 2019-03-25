/** @flow */

// load all diagnosis
// list checks
// run all checks
// run specific check

export default (async function runAll(): Promise<CheckResults[]> {
  return Promise.resolve([
    {
      name: 'check1',
      description: 'check1 desc',
      pass: true
    }
  ]);
});

export async function listChecks(): Promise<ChecksList> {
  return Promise.resolve([
    {
      name: 'check1',
      description: 'check1 desc'
    }
  ]);
}
