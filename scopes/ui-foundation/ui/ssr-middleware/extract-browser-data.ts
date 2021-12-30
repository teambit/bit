import { Request } from 'express';
import { BrowserData } from '../react-ssr';

/**
 * extract relevant information from Express request.
 */

export function extractBrowserData(req: Request, port: number) {
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
