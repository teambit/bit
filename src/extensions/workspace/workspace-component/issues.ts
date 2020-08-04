export type Issue = {
  name: string;
  files: {
    fileName: string;
    errors: any;
  }[];
};

export type LegacyIssues = {
  [errorName: string]: {
    [file: string]: any;
  };
}[];

export class Issues {
  constructor(public issues: Issue[]) {}

  get count() {
    return this.issues.length;
  }

  static fromLegacy(legacyIssues: LegacyIssues) {
    const issues = Object.entries(legacyIssues).map(([issueName, legacyFiles]) => {
      const files = Object.entries(legacyFiles).map(([fileName, errors]) => ({ fileName, errors }));
      return { name: issueName, files };
    });

    return new Issues(issues);
  }
}
