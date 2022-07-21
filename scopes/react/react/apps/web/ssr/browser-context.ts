import type { Request, Response } from 'express';
import type { IncomingHttpHeaders } from 'http';

export type PartialLocation = Pick<
  Location,
  'host' | 'hostname' | 'href' | 'origin' | 'pathname' | 'port' | 'protocol' | 'hash' | 'search'
>;

export type BrowserData = {
  location: PartialLocation;
  headers: IncomingHttpHeaders;
};

export type ServerData = {
  request: Request;
  response: Response;
  port: number;
};

export function calcBrowserData(req: Request, port: number): BrowserData {
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
