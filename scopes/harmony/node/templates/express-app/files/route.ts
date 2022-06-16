export function route() {
  return {
    relativePath: `route.ts`,
    content: `import { Request, Response } from 'express';

export type RouteDefinition = {
  method: string,
  route: string,
  callback: (req: Request, res: Response) => any
}
`,
  };
}
