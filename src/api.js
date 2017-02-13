import bit from 'bit-js';
import { getScopeBit } from './api/consumer/index';
import { scopeList } from './api/scope/index';

const isArray = bit('array/is');

module.exports = {
  show: (scopePath, id, opts) => getScopeBit({ scopePath, id, allVersions: opts && opts.versions })
  .then((c) => {
    if (isArray(c)) { return c.map(v => v.toObject()); }
    return c.toObject();
  }),
  list: scopePath => scopeList(scopePath)
  .then(components => components.map(c => c.id.toString())),
};
