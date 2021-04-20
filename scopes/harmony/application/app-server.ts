import { Application } from './application';

export class AppServer {
  constructor(private app: Application) {}

  get name() {
    return this.app.name;
  }
}
