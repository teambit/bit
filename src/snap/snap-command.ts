import React from 'react';
import { Color } from 'ink';
import { Command } from '../paper';
import { PaperOptions } from 'paper/command';
import GeneralError from '../error/general-error';
import { SnapOptions } from './types';
import Snap from './snap';
import { DEFAULT_BIT_RELEASE_TYPE } from '../constants';

export class SnapCommand implements Command {
  public name = 'snap [id] [version]';
  public description = 'snap command';
  public alias = '';
  public opts: PaperOptions = [
    ['m', 'message <message>', 'log message describing the user changes'],
    ['a', 'all [version]', 'tag all new and modified components'],
    ['s', 'scope <version>', 'tag all components of the current scope'],
    ['p', 'patch', 'increment the patch version number'],
    ['mi', 'minor', 'increment the minor version number'],
    ['ma', 'major', 'increment the major version number'],
    ['f', 'force', 'force-tag even if tests are failing and even when component has not changed'],
    ['v', 'verbose', 'show specs output on failure'],
    ['', 'ignore-missing-dependencies', 'DEPRECATED. use --ignore-unresolved-dependencies instead'],
    ['i', 'ignore-unresolved-dependencies', 'ignore missing dependencies (default = false)'],
    ['I', 'ignore-newest-version', 'ignore existing of newer versions (default = false)'],
    ['', 'skip-tests', 'skip running component tests during tag process'],
    ['', 'skip-auto-tag', 'EXPERIMENTAL. skip auto tagging dependents']
  ];

  constructor(private snapApi: Snap) {}

  render(
    [id, version]: string[],
    {
      message = '',
      all,
      patch,
      minor,
      major,
      force,
      verbose,
      ignoreMissingDependencies = false,
      ignoreUnresolvedDependencies = false,
      ignoreNewestVersion = false,
      skipTests = false,
      skipAutoTag = false,
      scope
    }: {
      version?: string;
      message?: string;
      all?: boolean;
      patch?: boolean;
      minor?: boolean;
      major?: boolean;
      force?: boolean;
      verbose?: boolean;
      ignoreMissingDependencies?: boolean;
      ignoreUnresolvedDependencies?: boolean;
      ignoreNewestVersion?: boolean;
      skipTests?: boolean;
      skipAutoTag?: boolean;
      scope?: boolean;
    }
  ) {
    // return Promise.resolve(<Color green>run snap  command</Color>);
    // return Promise.resolve(() => <Color green>Hello World</Color>);
    // return Promise.resolve(`<Color green>run snap command</Color>`);
    const releaseFlags = [patch, minor, major].filter(x => x);
    // TODO: use the yargs conflict for this instead
    if (releaseFlags.length > 1) {
      throw new GeneralError('you can use only one of the following - patch, minor, major');
    }
    // TODO: use the yargs REQUIRE for this instead
    if (scope && !version) {
      throw new GeneralError('you have to specify an exact version when using --scope');
    }
    // TODO: use the yargs conflict for this instead
    if (version && releaseFlags.length > 0) {
      throw new GeneralError('you can use only one of the following - version or patch, minor, major');
    }
    let releaseType = DEFAULT_BIT_RELEASE_TYPE;
    if (major) releaseType = 'major';
    else if (minor) releaseType = 'minor';
    else if (patch) releaseType = 'patch';

    const snapOptions: SnapOptions = {
      id,
      exactVersion: version,
      message,
      all,
      releaseType,
      force,
      verbose,
      ignoreMissingDependencies,
      ignoreUnresolvedDependencies,
      ignoreNewestVersion,
      skipTests,
      skipAutoTag,
      snapAllInScope: scope
    };

    const snapResult = this.snapApi.snap(snapOptions);
    console.log('result', snapResult);
    return Promise.resolve('snap run finished');
  }
}
