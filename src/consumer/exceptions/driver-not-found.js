export default class DriverNotFoundError extends Error {
  driver: string;
  lang: string;

  constructor(driver: string, lang: string) {
    super();
    this.driver = driver;
    this.lang = lang;
  }
}
