import { Application } from './application';

export class ApplicationServer {
  constructor(private app: Application) {}

  get name() {
    return this.app.name;
  }
}
