import Reporter from './reporter';

export type InstallDeps = [Reporter];

export async function provideReporter() {
  return new Reporter();
}
