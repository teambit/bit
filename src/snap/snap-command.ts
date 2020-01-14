import React, { Component } from 'react';
import { Color } from 'ink';
import { Command } from '../paper';
import { PaperOptions } from 'paper/command';

export class SnapCommand implements Command {
  public name = 'snap';
  description = 'snap command';
  alias = '';
  opts: PaperOptions = [
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

  render(args: PaperOptions) {
    // return Promise.resolve(<Color green>run snap command</Color>);
    return Promise.resolve(`<Color green>run snap command</Color>`);
    // return Promise.resolve('gilad');
  }
}
