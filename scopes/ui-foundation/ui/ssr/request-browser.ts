import type { IncomingHttpHeaders } from 'http';
import type { Request } from 'express';

export type ParsedQuery = { [key: string]: undefined | string | string[] | ParsedQuery | ParsedQuery[] };

export type BrowserData = {
  connection: {
    secure: boolean;
    headers: IncomingHttpHeaders;
    body: any;
  };
  /**
   * isomorphic location object, resembling the browser's window.location
   */
  location: {
    /** hostname + port
     * @example localhost:3000
     */
    host: string;
    /**
     * @example localhost
     */
    hostname: string;
    /** full url
     * @example http://localhost:3000/components?q=button
     */
    href: string;
    /** full url without query
     * @example http://localhost:3000/components
     */
    origin: string;
    /**
     * @example /component
     */
    pathname: string;
    /**
     * @example 3000
     */
    port: number;
    /**
     * @example http
     */
    protocol: string;
    /**
     * parsed search params
     * @example { one: 1, two: [2,3]}
     */
    query: ParsedQuery;
    /**
     * full resource path, including query, without hostname
     * @example /components?q=button
     */
    url: string;
  };
  cookie?: string;
};

/**
 * extract relevant information from Express request.
 */
export function requestToObj(req: Request, port: number) {
  // apparently port is not readily available in request.

  const browser: BrowserData = {
    connection: {
      secure: req.secure,
      headers: req.headers,
      body: req.body,
    },
    // trying to match to browser.location
    location: {
      host: `${req.hostname}:${port}`,
      hostname: req.hostname,
      href: `${req.protocol}://${req.hostname}:${port}${req.url}`,
      origin: `${req.protocol}://${req.hostname}:${port}`,
      pathname: req.path,
      port,
      protocol: `${req.protocol}:`,
      query: req.query,
      url: req.url,
    },
    cookie: req.header('Cookie'),
  };

  return browser;
}
