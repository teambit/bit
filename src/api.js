import { getScopeComponent } from './api/consumer/index';
import { scopeList } from './api/scope/index';

module.exports = {
  show: (scopePath, id, opts) => getScopeComponent({ scopePath, id, allVersions: opts && opts.versions })
  .then((c) => {
    if (Array.isArray(c)) { return c.map(v => v.toObject()); }
    return c.toObject();
  }),
  list: scopePath => scopeList(scopePath)
  .then(components => components.map(c => c.id.toString())),
};
