export default class DriverNotFoundError extends Error {
  driver: string;
  lang: string;
  name: string;

  constructor(driver: string, lang: string) {
    super();
    this.name = 'DriverNotFound';
    this.driver = driver;
    this.lang = lang;
  }
}
