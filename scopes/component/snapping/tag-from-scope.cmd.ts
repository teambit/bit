import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { NOTHING_TO_TAG_MSG, tagCmdOptions, TagParams, validateOptions, tagResultOutput } from './tag-cmd';
import { getBitVersion } from '@teambit/bit.get-bit-version';
import { Logger } from '@teambit/logger';
import { SnappingMain } from './snapping.main.runtime';

const excludeOptions = ['unmodified', 'editor [editor]', 'snapped', 'unmerged', 'soft', 'persist [skip-build]'];

export type TagDataPerCompRaw = {
  componentId: string;
  dependencies?: string[];
  versionToTag?: string;
  prereleaseId?: string;
  message?: string;
};

export class TagFromScopeCmd implements Command {
  name = '_tag <data>';
  group = 'development';
  private = true;
  description =
    'tag components from a bare-scope by using build artifacts from previous snap and running the deploy-pipeline only';
  extendedDescription = `this command should be running from a new bare scope, it first imports the components it needs and then processes the tag.
the input data is a stringified JSON of an array of the following object.
{
  componentId: string;    // ids always have scope, so it's safe to parse them from string
  dependencies?: string[]; // e.g. [teambit/compiler@1.0.0, teambit/tester^@1.0.0, teambit/linter~@0.0.1]
  versionToTag?: string;  // specific version (e.g. '1.0.0') or semver (e.g. 'minor', 'patch')
  prereleaseId?: string;  // applicable when versionToTag is a pre-release. (e.g. "dev", for 1.0.0-dev.1)
  message?: string;       // tag-message.
}
an example of the final data: '[{"componentId":"ci.remote2/comp-b","dependencies":["ci.remote/comp1@0.0.2"]}]'
`;
  alias = '';
  loader = true;
  options = [
    ['', 'push', 'export the updated objects to the original scopes once done'],
    ['', 'rebuild-artifacts', 'run the full build pipeline. do not use the saved artifacts from the last snap'],
    ['', 'ignore-last-pkg-json', 'ignore the package.json created by the last snap'],
    [
      '',
      'override-head',
      'opposite of detach-head. in case a component is checked out to and older version, change head to the newly created version',
    ],
    ...tagCmdOptions.filter((o) => !excludeOptions.includes(o[1])),
  ] as CommandOptions;
  remoteOp = true; // In case a compiler / tester is not installed

  constructor(
    private snapping: SnappingMain,
    private logger: Logger
  ) {}

  // eslint-disable-next-line complexity
  async report(
    [data]: [string],
    options: {
      push?: boolean;
      rebuildArtifacts?: boolean;
      ignoreLastPkgJson?: boolean;
    } & Partial<TagParams>
  ): Promise<string> {
    const { releaseType, preReleaseId } = validateOptions(options);

    const {
      push,
      message = '',
      ver,
      ignoreIssues,
      ignoreNewestVersion = false,
      skipTests = false,
      skipTasks,
      disableTagPipeline = false,
      ignoreBuildErrors = false,
      rebuildArtifacts,
      ignoreLastPkgJson,
      rebuildDepsGraph,
      incrementBy = 1,
      detachHead,
      overrideHead,
    } = options;

    const params = {
      push,
      message,
      releaseType,
      preReleaseId,
      ignoreIssues,
      ignoreNewestVersion,
      skipTests,
      skipTasks,
      build: true,
      persist: true,
      disableTagAndSnapPipelines: disableTagPipeline,
      ignoreBuildErrors,
      rebuildDepsGraph,
      incrementBy,
      version: ver,
      rebuildArtifacts,
      ignoreLastPkgJson,
      detachHead,
      overrideHead,
    };

    const tagDataPerCompRaw = this.parseData(data);
    this.logger.console(`tagging using ${getBitVersion()} version`);
    const results = await this.snapping.tagFromScope(tagDataPerCompRaw, params);
    if (!results) return chalk.yellow(NOTHING_TO_TAG_MSG);
    return tagResultOutput(results);
  }
  private parseData(data: string): TagDataPerCompRaw[] {
    let dataParsed: unknown;
    try {
      dataParsed = JSON.parse(data);
    } catch (err: any) {
      throw new Error(`failed parsing the data entered as JSON. err ${err.message}`);
    }
    if (!Array.isArray(dataParsed)) {
      throw new Error('expect data to be an array');
    }
    dataParsed.forEach((dataItem) => {
      if (!dataItem.componentId) throw new Error('expect data item to have "componentId" prop');
    });
    return dataParsed;
  }
}
