export class AppNotFound extends Error {
  constructor(appName: string) {
    super(`app ${appName} was not found`);
  }
}
