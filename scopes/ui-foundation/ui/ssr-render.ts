import { Request, Response, NextFunction } from 'express';

export async function ssrRender({ entryFilePath, assets }: { entryFilePath: string; assets?: {} }) {
  let render: (...arg: any[]) => any;

  try {
    const imported = await import(entryFilePath);
    render = imported?.render;

    if (!render) return (req: Request, res: Response, next: NextFunction) => next();
  } catch (e) {
    console.error('error!', e);
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  // WIP
  return function ssrRenderingMiddleware(req: Request, res: Response, next: NextFunction) {
    const { query, url } = req;
    if (query.rendering !== 'server') {
      console.log('ssr bounce', url);
      next();
      return;
    }

    console.log(`ssr - ${url}`);
    Promise.resolve(render(assets))
      .then((rendered) => {
        res.send(rendered);
      })
      .catch((e) => {
        res.send(`exception during SSR! ${e.toString()}`);
      });
  };
}
