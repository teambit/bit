// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import runAndUpdateCI from './run-and-update-ci';

const scopePath = process.env.__scope__;
const id = process.env.__id__;

if (!id) {
  throw new Error('id for ci-worker must be provided');
}

runAndUpdateCI({ id, scopePath })
  .then(() => null)
  .catch((er) => process.stderr.write(er));
