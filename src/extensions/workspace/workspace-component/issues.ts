import { BitId } from '../../../bit-id';

export type Issue = {
  name: string;
  files: {
    fileName: string;
    reference: string;
  }[];
};

export type LegacyIssues = {
  [errorName: string]: {
    [file: string]: BitId | string;
  };
}[];

export class Issues {
  constructor(public issues: Issue[]) {}

  get count() {
    return this.issues.length;
  }

  static fromLegacy(legacyIssues: LegacyIssues) {
    const issues = Object.entries(legacyIssues).map(([issueName, legacyFiles]) => {
      const files = Object.entries(legacyFiles).map(([fileName, reference]) => {
        return { fileName, reference: reference.toString() };
      });
      return { name: issueName, files };
    });

    return new Issues(issues);
  }
}
