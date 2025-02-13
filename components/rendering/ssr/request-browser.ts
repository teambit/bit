import type { IncomingHttpHeaders } from 'http';

export type PartialLocation = Pick<
  Location,
  'host' | 'hostname' | 'href' | 'origin' | 'pathname' | 'port' | 'protocol' | 'hash' | 'search'
>;

export type BrowserData = {
  location: PartialLocation;
  headers: IncomingHttpHeaders;
};
