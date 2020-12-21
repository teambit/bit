import type { IncomingHttpHeaders } from 'http';
import type { Request } from 'express';

export type ParsedQuery = { [key: string]: undefined | string | string[] | ParsedQuery | ParsedQuery[] };

export type BrowserData = {
  connection: {
    secure: boolean;
    headers: IncomingHttpHeaders;
    body: any;
  };
  location: {
    baseUrl: string;
    hostname: string;
    query: ParsedQuery;
    // search: string;
    pathname: string;
    protocol: string;
    href: string;
  };
  cookie?: string;
};

/**
 * extract relevant information from Express request.
 */
export function requestToObj(req: Request) {
  const browser: BrowserData = {
    connection: {
      secure: req.secure,
      headers: req.headers,
      body: req.body,
    },
    // trying to match to browser.location
    location: {
      baseUrl: req.baseUrl,
      // host: req.host, // deprecated
      hostname: req.hostname,
      query: req.query,
      pathname: req.path,
      protocol: req.protocol,
      href: req.url, // complete url
      // hash: ''
      // port: ''
    },
    cookie: req.header('Cookie'),
  };

  return browser;
}
