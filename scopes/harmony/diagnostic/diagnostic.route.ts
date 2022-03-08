import { Route, Verb, Request, Response } from '@teambit/express';
import type { DiagnosticMain } from './diagnostic.main.runtime';

export class DiagnosticRoute implements Route {
  constructor(readonly diagnosticMain: DiagnosticMain) {}

  method = 'GET';
  route = '/_diagnostic';
  verb = Verb.READ;

  middlewares = [
    async (req: Request, res: Response) => {
      const diagnosticData = this.diagnosticMain.getDiagnosticData();
      res.json(diagnosticData);
    },
  ];
}
