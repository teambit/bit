export class AppNoSsr extends Error {
  constructor(appName: string) {
    super(`app "${appName}" does not support serverside execution`);
  }
}
