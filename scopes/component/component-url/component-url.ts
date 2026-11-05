import { affix } from '@teambit/base-ui.utils.string.affix';
import type { ComponentID } from '@teambit/component-id';
import { baseUrl } from './constants';

export type ToUrlOptions = {
  includeVersion?: boolean;
  useLocationOrigin?: boolean;
};

export type ToQueryOptions = ToUrlOptions;

const semverRegex = /[\^~]/;

function toPathname(id: ComponentID) {
  return id.toString({ ignoreVersion: true }).replace('.', '/');
}

function toQuery(id: ComponentID, { includeVersion = true }: ToQueryOptions = {}) {
  const version = includeVersion && id.version !== 'latest' ? id.version?.replace(semverRegex, '') : undefined;

  return {
    version,
  };
}

function toUrl(id: ComponentID, options: ToUrlOptions = {}) {
  const { version } = toQuery(id, options);
  const query = version ? new URLSearchParams({ version }).toString() : '';
  const { useLocationOrigin } = options;
  const domain = useLocationOrigin ? window.location.origin : baseUrl;

  return `${domain}/${toPathname(id)}${affix('?', query)}`;
}

/** stringifies a component id to a url */
export const ComponentUrl = {
  toUrl,
  toPathname,
  toQuery,
};
