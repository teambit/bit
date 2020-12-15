import { Request, Response, NextFunction } from 'express';

export async function ssrRender({ entryFilePath, assets }: { entryFilePath: string; assets?: {} }) {
  const imported = await import(entryFilePath);
  const render = imported?.render;

  if (!render) return (req: Request, res: Response, next: NextFunction) => next();

  return function ssrRenderingMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!render) {
      next();
      return;
    }

    Promise.resolve(render(assets))
      .then((rendered) => {
        res.send(rendered);
      })
      .catch((e) => {
        res.send(`exception during SSR! ${e.toString()}`);
      });
  };
}
