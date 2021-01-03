import type { Request, Response } from 'express';

/**
 * Represents the server configuration for the current request
 */
export type RequestServer = {
  port: number;
  request: Request;
  response: Response;
};
