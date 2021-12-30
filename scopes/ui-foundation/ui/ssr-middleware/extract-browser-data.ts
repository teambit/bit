import { Request } from 'express';
import { BrowserData } from '../react-ssr';

/**
 * extract relevant information from Express request.
 */

export function extractBrowserData(req: Request, port: number) {
  const browser: BrowserData = {
    connection: {
      secure: req.secure,
      headers: req.headers,
      body: req.body,
    },
    // rebuild browser location from request, +port
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
