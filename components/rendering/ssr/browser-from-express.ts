import type { Request } from 'express';
import { BrowserData, PartialLocation } from './request-browser';

/** extract BrowserData from Express request (convinience method) */
export function browserFromExpress(req: Request, port: number): BrowserData {
  return {
    location: requestToLocation(req, port),
    headers: req.headers,
  };
}

function requestToLocation(request: Request, port: number): PartialLocation {
  return {
    host: `${request.hostname}:${port}`,
    hostname: request.hostname,
    href: `${request.protocol}://${request.hostname}:${port}${request.url}`,
    origin: `${request.protocol}://${request.hostname}:${port}`,
    pathname: request.path,
    port: port.toString(),
    protocol: `${request.protocol}:`,

    hash: '',
    search: extractSearch(request.url),
  };
}

function extractSearch(url: string) {
  const [, after] = url.split('?');
  if (!after) return '';

  return `?${after}`;
}
