import runAndUpdateCI from './run-and-update-ci';

const scopePath = process.env.__scope__;
const id = process.env.__id__;

runAndUpdateCI({ id, scopePath })
  .then(() => null)
  .catch(er => process.stderr.write(er));
