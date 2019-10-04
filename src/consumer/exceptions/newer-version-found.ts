import AbstractError from '../../error/abstract-error';

export type NewerVersion = {
  componentId: string;
  currentVersion: string;
  latestVersion: string;
};
export default class NewerVersionFound extends AbstractError {
  newerVersions: NewerVersion[];

  constructor(newerVersions: NewerVersion[]) {
    super();
    this.name = 'NewerVersionFound';
    this.newerVersions = newerVersions;
  }
}
