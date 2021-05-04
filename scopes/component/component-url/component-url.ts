import queryString from 'query-string';
import { affix } from '@teambit/base-ui.utils.string.affix';
import { ComponentID } from '@teambit/component-id';
import { baseUrl } from './constants';

/** stringifies a component id to a url */
export const ComponentUrl = {
  toUrl,
  toPathname,
  toQuery,
};

export type toUrlOptions = {
  includeVersion?: boolean;
};

export type toQueryOptions = toUrlOptions;

function toUrl(id: ComponentID, options: toUrlOptions = {}) {
  const query = queryString.stringify(toQuery(id, options));

  return `${baseUrl}/${toPathname(id)}${affix('?', query)}`;
}

function toPathname(id: ComponentID) {
  return id.toString({ ignoreVersion: true }).replace('.', '/');
}

const semverRegex = /[\^~]/;
function toQuery(id: ComponentID, { includeVersion = true }: toQueryOptions = {}) {
  const version = includeVersion && id.version !== 'latest' ? id.version?.replace(semverRegex, '') : undefined;

  return {
    version,
  };
}
