import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { TagResults, NOTHING_TO_TAG_MSG, AUTO_TAGGED_MSG } from '@teambit/legacy/dist/api/consumer/lib/tag';
import { DEFAULT_BIT_RELEASE_TYPE } from '@teambit/legacy/dist/constants';
import { IssuesClasses } from '@teambit/component-issues';
import { ReleaseType } from 'semver';
import { BitError } from '@teambit/bit-error';
import { Logger } from '@teambit/logger';
import { SnappingMain } from './snapping.main.runtime';
import { BasicTagParams } from './tag-model-component';

const RELEASE_TYPES = ['major', 'premajor', 'minor', 'preminor', 'patch', 'prepatch', 'prerelease'];

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
  description = 'create an immutable and exportable component snapshot, tagged with a release version.';
  extendedDescription = `this command should be running from a new bare scope, it first imports the components it needs and then processes the tag.
the input data is a stringified JSON of an array of the following object.
{
  componentId: string;    // ids always have scope, so it's safe to parse them from string
  dependencies: string[]; // e.g. [teambit/compiler@1.0.0, teambit/tester@1.0.0]
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
    ['m', 'message <message>', 'a log message describing latest changes'],
    ['v', 'ver <version>', 'tag with the given version'],
    ['l', 'increment <level>', `options are: [${RELEASE_TYPES.join(', ')}], default to patch`],
    ['', 'prerelease-id <id>', 'prerelease identifier (e.g. "dev" to get "1.0.0-dev.1")'],
    ['p', 'patch', 'syntactic sugar for "--increment patch"'],
    ['', 'minor', 'syntactic sugar for "--increment minor"'],
    ['', 'major', 'syntactic sugar for "--increment major"'],
    ['', 'pre-release [identifier]', 'syntactic sugar for "--increment prerelease" and `--prerelease-id <identifier>`'],
    ['', 'skip-tests', 'skip running component tests during tag process'],
    ['', 'disable-tag-pipeline', 'skip the tag pipeline to avoid publishing the components'],
    ['', 'force-deploy', 'run the tag pipeline although the build failed'],
    [
      '',
      'increment-by <number>',
      '(default to 1) increment semver flag (patch/minor/major) by. e.g. incrementing patch by 2: 0.0.1 -> 0.0.3.',
    ],
    [
      'i',
      'ignore-issues [issues]',
      `ignore component issues (shown in "bit status" as "issues found"), issues to ignore:
[${Object.keys(IssuesClasses).join(', ')}]
to ignore multiple issues, separate them by a comma and wrap with quotes. to ignore all issues, specify "*".`,
    ],
    ['I', 'ignore-newest-version', 'ignore existing of newer versions (default = false)'],
    ['b', 'build', 'EXPERIMENTAL. not needed for now. run the pipeline build and complete the tag'],
  ] as CommandOptions;
  remoteOp = true; // In case a compiler / tester is not installed

  constructor(private snapping: SnappingMain, private logger: Logger) {}

  // eslint-disable-next-line complexity
  async report(
    [data]: [string],
    {
      push,
      message = '',
      ver,
      patch,
      minor,
      major,
      preRelease,
      increment,
      prereleaseId,
      ignoreIssues,
      ignoreNewestVersion = false,
      skipTests = false,
      build,
      disableTagPipeline = false,
      forceDeploy = false,
      incrementBy = 1,
    }: {
      push?: boolean;
      ver?: string;
      patch?: boolean;
      minor?: boolean;
      major?: boolean;
      increment?: ReleaseType;
      preRelease?: string;
      prereleaseId?: string;
      ignoreIssues?: string;
      incrementBy?: number;
      disableTagPipeline?: boolean;
    } & Partial<BasicTagParams>
  ): Promise<string> {
    if (ignoreIssues && typeof ignoreIssues === 'boolean') {
      throw new BitError(`--ignore-issues expects issues to be ignored, please run "bit tag -h" for the issues list`);
    }
    if (prereleaseId && (!increment || increment === 'major' || increment === 'minor' || increment === 'patch')) {
      throw new BitError(
        `--prerelease-id should be entered along with --increment flag, while --increment must be one of the following: [prepatch, prerelease, preminor, premajor]`
      );
    }

    const releaseFlags = [patch, minor, major, preRelease].filter((x) => x);
    if (releaseFlags.length > 1) {
      throw new BitError('you can use only one of the following - patch, minor, major, pre-release');
    }

    const getReleaseType = (): ReleaseType => {
      if (increment) {
        if (!RELEASE_TYPES.includes(increment)) {
          throw new BitError(`invalid increment-level "${increment}".
  semver allows the following options only: ${RELEASE_TYPES.join(', ')}`);
        }
        return increment;
      }
      if (major) return 'major';
      if (minor) return 'minor';
      if (patch) return 'patch';
      if (preRelease) return 'prerelease';
      return DEFAULT_BIT_RELEASE_TYPE;
    };
    const getPreReleaseId = (): string | undefined => {
      if (prereleaseId) {
        return prereleaseId;
      }
      if (preRelease && typeof preRelease === 'string') {
        return preRelease;
      }
      return undefined;
    };

    const params = {
      push,
      message,
      releaseType: getReleaseType(),
      preReleaseId: getPreReleaseId(),
      ignoreIssues,
      ignoreNewestVersion,
      skipTests,
      build,
      disableTagAndSnapPipelines: disableTagPipeline,
      forceDeploy,
      incrementBy,
      version: ver,
    };

    const tagDataPerCompRaw = this.parseData(data);

    const results = await this.snapping.tagFromScope(tagDataPerCompRaw, params);
    if (!results) return chalk.yellow(NOTHING_TO_TAG_MSG);
    const { taggedComponents, autoTaggedResults, warnings, newComponents }: TagResults = results;
    const changedComponents = taggedComponents.filter((component) => !newComponents.searchWithoutVersion(component.id));
    const addedComponents = taggedComponents.filter((component) => newComponents.searchWithoutVersion(component.id));
    const autoTaggedCount = autoTaggedResults ? autoTaggedResults.length : 0;

    const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';
    const tagExplanationPersist = `\n(use "bit export [collection]" to push these components to a remote")
(use "bit reset" to unstage versions)\n`;
    const tagExplanationSoft = `\n(use "bit tag --persist" to persist the changes")
(use "bit reset --soft" to remove the soft-tags)\n`;

    const tagExplanation = results.isSoftTag ? tagExplanationSoft : tagExplanationPersist;

    const outputComponents = (comps) => {
      return comps
        .map((component) => {
          let componentOutput = `     > ${component.id.toString()}`;
          const autoTag = autoTaggedResults.filter((result) =>
            result.triggeredBy.searchWithoutScopeAndVersion(component.id)
          );
          if (autoTag.length) {
            const autoTagComp = autoTag.map((a) => a.component.id.toString());
            componentOutput += `\n       ${AUTO_TAGGED_MSG}:
            ${autoTagComp.join('\n            ')}`;
          }
          return componentOutput;
        })
        .join('\n');
    };

    const publishOutput = () => {
      const { publishedPackages } = results;
      if (!publishedPackages || !publishedPackages.length) return '';
      const successTitle = `\n\n${chalk.green(
        `published the following ${publishedPackages.length} component(s) successfully\n`
      )}`;
      const successCompsStr = publishedPackages.join('\n');
      const successOutput = successCompsStr ? successTitle + successCompsStr : '';
      return successOutput;
    };

    const softTagPrefix = results.isSoftTag ? 'soft-tagged ' : '';
    const outputIfExists = (label, explanation, components) => {
      if (!components.length) return '';
      return `\n${chalk.underline(softTagPrefix + label)}\n(${explanation})\n${outputComponents(components)}\n`;
    };

    const newDesc = results.isSoftTag
      ? 'set to be tagged first version for components'
      : 'first version for components';
    const changedDesc = results.isSoftTag
      ? 'components that set to get a version bump'
      : 'components that got a version bump';
    const softTagClarification = results.isSoftTag
      ? chalk.bold(
          'keep in mind that this is a soft-tag (changes recorded to be tagged), to persist the changes use --persist flag'
        )
      : '';
    return (
      warningsOutput +
      chalk.green(
        `${taggedComponents.length + autoTaggedCount} component(s) ${results.isSoftTag ? 'soft-' : ''}tagged`
      ) +
      tagExplanation +
      outputIfExists('new components', newDesc, addedComponents) +
      outputIfExists('changed components', changedDesc, changedComponents) +
      publishOutput() +
      softTagClarification
    );
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
