import Logger from './logger';

export async function provideLogger() {
  return new Logger();
}
