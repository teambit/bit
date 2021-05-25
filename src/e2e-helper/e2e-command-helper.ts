import { expect } from 'chai';
import chalk from 'chalk';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import childProcess, { StdioOptions } from 'child_process';
import rightpad from 'pad-right';
import * as path from 'path';
import tar from 'tar';

import { BUILD_ON_CI, ENV_VAR_FEATURE_TOGGLE } from '../api/consumer/lib/feature-toggle';
import { NOTHING_TO_TAG_MSG } from '../api/consumer/lib/tag';
import { NOTHING_TO_SNAP_MSG } from '../cli/commands/public-cmds/snap-cmd';
import { CURRENT_UPSTREAM, LANE_REMOTE_DELIMITER } from '../constants';
import runInteractive, { InteractiveInputs } from '../interactive/utils/run-interactive-cmd';
import { removeChalkCharacters } from '../utils';
import ScopesData from './e2e-scopes';

const DEFAULT_DEFAULT_INTERVAL_BETWEEN_INPUTS = 200;

/**
 * to enable a feature for Helper instance, in the e2e-test file add `helper.command.setFeatures('your-feature');`
 * to enable a feature for a single command, add the feature to the runCmd, e.g. `runCmd(cmd, cwd, stdio, 'your-feature');`
 * if you set both, the runCmd wins.
 * more about feature-toggle head to feature-toggle.ts file.
 */
export default class CommandHelper {
  scopes: ScopesData;
  debugMode: boolean;
  bitBin: string;
  featuresToggle: string | string[] | undefined;
  constructor(scopes: ScopesData, debugMode: boolean) {
    this.scopes = scopes;
    this.debugMode = debugMode;
    this.bitBin = process.env.npm_config_bit_bin || 'bit'; // e.g. npm run e2e-test --bit_bin=bit-dev
  }

  setFeatures(featuresToggle: string | string[]) {
    this.featuresToggle = featuresToggle;
  }
  resetFeatures() {
    this.featuresToggle = undefined;
  }

  runCmd(
    cmd: string,
    cwd: string = this.scopes.localPath,
    stdio: StdioOptions = 'pipe',
    overrideFeatures?: string
  ): string {
    if (this.debugMode) console.log(rightpad(chalk.green('cwd: '), 20, ' '), cwd); // eslint-disable-line no-console
    const isBitCommand = cmd.startsWith('bit ');
    if (isBitCommand) cmd = cmd.replace('bit', this.bitBin);
    const featuresTogglePrefix = isBitCommand ? this._getFeatureToggleCmdPrefix(overrideFeatures) : '';
    cmd = featuresTogglePrefix + cmd;
    if (this.debugMode) console.log(rightpad(chalk.green('command: '), 20, ' '), cmd); // eslint-disable-line no-console
    // const cmdOutput = childProcess.execSync(cmd, { cwd, shell: true });
    const cmdOutput = childProcess.execSync(cmd, { cwd, stdio });
    if (this.debugMode) console.log(rightpad(chalk.green('output: '), 20, ' '), chalk.cyan(cmdOutput.toString())); // eslint-disable-line no-console
    return cmdOutput.toString();
  }

  _getFeatureToggleCmdPrefix(overrideFeatures?: string): string {
    const featuresToggle = overrideFeatures || this.featuresToggle;
    if (!featuresToggle) return '';
    const featuresToggleStr = Array.isArray(featuresToggle) ? featuresToggle.join(',') : featuresToggle;
    const bitFeaturesEnvVar = `${ENV_VAR_FEATURE_TOGGLE}=${featuresToggleStr}`;
    if (process.platform === 'win32') {
      return `set "${bitFeaturesEnvVar}" && `;
    }
    return `${bitFeaturesEnvVar} `;
  }

  listRemoteScope(raw = true, options = '') {
    return this.runCmd(`bit list ${this.scopes.remote} ${options} ${raw ? '--raw' : ''}`);
  }
  listLocalScope(options = '') {
    return this.runCmd(`bit list ${options}`);
  }
  listLocalScopeParsed(options = ''): Record<string, any>[] {
    const output = this.runCmd(`bit list --json ${options}`);
    return JSON.parse(output);
  }
  listRemoteScopeParsed(options = '') {
    const output = this.runCmd(`bit list ${this.scopes.remote} --json ${options}`);
    return JSON.parse(output);
  }
  listScopeParsed(scope: string, options = '') {
    const output = this.runCmd(`bit list ${scope} --json ${options}`);
    return JSON.parse(output);
  }

  catScope(includeExtraData = false, cwd = this.scopes.localPath) {
    const extraData = includeExtraData ? '--json-extra' : '';
    const result = this.runCmd(`bit cat-scope --json ${extraData}`, cwd);
    return JSON.parse(result);
  }

  catObject(hash: string, parse = false) {
    const result = this.runCmd(`bit cat-object ${hash}`);
    if (!parse) return result;
    return JSON.parse(result);
  }

  catComponent(id: string, cwd?: string, parse = true): Record<string, any> {
    const result = this.runCmd(`bit cat-component ${id} --json`, cwd);
    return parse ? JSON.parse(result) : result;
  }
  catLane(id: string, cwd?: string): Record<string, any> {
    const result = this.runCmd(`bit cat-lane ${id}`, cwd);
    return JSON.parse(result);
  }
  addComponent(filePaths: string, options: Record<string, any> | string = {}, cwd: string = this.scopes.localPath) {
    const value =
      typeof options === 'string'
        ? options
        : Object.keys(options)
            .map((key) => `-${key} ${options[key]}`)
            .join(' ');
    return this.runCmd(`bit add ${filePaths} ${value}`, cwd);
  }
  sign(ids: string[], flags = '', cwd = this.scopes.localPath) {
    return this.runCmd(`bit sign ${ids.join(' ')} ${flags}`, cwd);
  }
  updateDependencies(data: Record<string, any>, flags = '', cwd = this.scopes.localPath) {
    return this.runCmd(`bit update-dependencies '${JSON.stringify(data)}' ${flags}`, cwd);
  }
  getConfig(configName: string) {
    return this.runCmd(`bit config get ${configName}`);
  }
  delConfig(configName: string) {
    return this.runCmd(`bit config del ${configName}`);
  }
  setConfig(configName: string, configVal: string) {
    return this.runCmd(`bit config set ${configName} ${configVal}`);
  }
  untrackComponent(id = '', all = false, cwd: string = this.scopes.localPath) {
    return this.runCmd(`bit untrack ${id} ${all ? '--all' : ''}`, cwd);
  }
  removeComponent(id: string, flags = '') {
    return this.runCmd(`bit remove ${id} --silent ${flags}`);
  }
  deprecateComponent(id: string, flags = '') {
    return this.runCmd(`bit deprecate ${id} ${flags}`);
  }
  undeprecateComponent(id: string, flags = '') {
    return this.runCmd(`bit undeprecate ${id} ${flags}`);
  }
  tagComponent(id: string, tagMsg = 'tag-message', options = '') {
    return this.runCmd(`bit tag ${id} -m ${tagMsg} ${options} --build`);
  }
  tagWithoutMessage(id: string, version = '', options = '') {
    return this.runCmd(`bit tag ${id} ${version} ${options} --build`);
  }
  tagAllComponents(options = '', version = '', assertTagged = true) {
    const result = this.runCmd(`bit tag -a ${version} ${options} --build`);
    if (assertTagged) expect(result).to.not.have.string(NOTHING_TO_TAG_MSG);
    return result;
  }
  tagAllWithoutBuild(options = '') {
    const result = this.runCmd(`bit tag -a ${options}`, undefined, undefined, BUILD_ON_CI);
    expect(result).to.not.have.string(NOTHING_TO_TAG_MSG);
    return result;
  }
  tagWithoutBuild(id: string, options = '') {
    const result = this.runCmd(`bit tag ${id} ${options}`, undefined, undefined, BUILD_ON_CI);
    expect(result).to.not.have.string(NOTHING_TO_TAG_MSG);
    return result;
  }
  rewireAndTagAllComponents(options = '', version = '', assertTagged = true) {
    this.linkAndRewire();
    return this.tagAllComponents(options, version, assertTagged);
  }
  tagScope(version: string, message = 'tag-message', options = '') {
    return this.runCmd(`bit tag -s ${version} -m ${message} ${options} --build`);
  }
  tagScopeWithoutBuild(version = '', options = '') {
    return this.runCmd(`bit tag -s ${version} ${options}`, undefined, undefined, BUILD_ON_CI);
  }
  softTag(options = '') {
    return this.runCmd(`bit tag --soft ${options}`);
  }
  persistTag(options = '') {
    return this.runCmd(`bit tag --persist ${options}`);
  }
  snapComponent(id: string, tagMsg = 'snap-message', options = '') {
    return this.runCmd(`bit snap ${id} -m ${tagMsg} ${options}`);
  }
  snapComponentWithoutBuild(id: string, options = '') {
    return this.runCmd(`bit snap ${id} ${options}`, undefined, undefined, BUILD_ON_CI);
  }
  snapAllComponents(options = '', assertSnapped = true) {
    const result = this.runCmd(`bit snap -a ${options} `);
    if (assertSnapped) expect(result).to.not.have.string(NOTHING_TO_SNAP_MSG);
    return result;
  }
  snapAllComponentsWithoutBuild(options = '', assertSnapped = true) {
    const result = this.runCmd(`bit snap -a ${options} `, undefined, undefined, BUILD_ON_CI);
    if (assertSnapped) expect(result).to.not.have.string(NOTHING_TO_SNAP_MSG);
    return result;
  }
  createLane(laneName = 'dev') {
    return this.runCmd(`bit switch ${laneName} --create`);
  }
  clearCache() {
    return this.runCmd('bit clear-cache');
  }
  removeLane(laneName = 'dev', options = '') {
    return this.runCmd(`bit remove ${laneName} ${options} --lane --silent`);
  }
  removeRemoteLane(laneName = 'dev', options = '') {
    return this.runCmd(`bit remove ${this.scopes.remote}/${laneName} ${options} --remote --lane --silent`);
  }
  showLanes(options = '') {
    const results = this.runCmd(`bit lane ${options}`);
    return removeChalkCharacters(results) as string;
  }
  showOneLane(name: string) {
    return this.runCmd(`bit lane ${name}`);
  }
  showLanesParsed(options = '') {
    const results = this.runCmd(`bit lane ${options} --json`);
    return JSON.parse(results);
  }
  showRemoteLanesParsed(options = '') {
    const results = this.runCmd(`bit lane --remote ${this.scopes.remote} ${options} --json`);
    return JSON.parse(results);
  }
  showOneLaneParsed(name: string) {
    const results = this.runCmd(`bit lane ${name} --json`);
    const parsed = JSON.parse(results);
    return parsed.lanes[0];
  }
  getHead(id: string, cwd?: string) {
    const comp = this.catComponent(id, cwd);
    return comp.head;
  }
  getHeadOfLane(laneName: string, componentName: string) {
    const lane = this.catLane(laneName);
    const component = lane.components.find((c) => c.id.name === componentName);
    return component.head;
  }
  getArtifacts(id: string) {
    const comp = this.catComponent(`${id}@latest`);
    const builderExt = comp.extensions.find((ext) => ext.name === 'teambit.pipelines/builder');
    if (!builderExt) throw new Error(`unable to find builder data for ${id}`);
    const artifacts = builderExt.data.artifacts;
    if (!artifacts) throw new Error(`unable to find artifacts data for ${id}`);
    return artifacts;
  }
  untag(id: string) {
    return this.runCmd(`bit untag ${id}`);
  }
  untagSoft(id: string) {
    return this.runCmd(`bit untag ${id} --soft`);
  }
  exportComponent(id: string, scope: string = this.scopes.remote, assert = true, flags = '') {
    const result = this.runCmd(`bit export ${scope} ${id} ${flags}`);
    if (assert) expect(result).to.not.have.string('nothing to export');
    return result;
  }
  exportLane(laneName: string, scope: string = this.scopes.remote, assert = true) {
    const result = this.runCmd(`bit export ${scope} ${laneName} --force --lanes`);
    if (assert) expect(result).to.not.have.string('nothing to export');
    return result;
  }
  exportAllComponents(scope: string = this.scopes.remote) {
    return this.runCmd(`bit export ${scope} --force`);
  }
  exportAllComponentsAndRewire(scope: string = this.scopes.remote) {
    return this.runCmd(`bit export ${scope} --rewire --force`);
  }
  exportToDefaultAndRewire() {
    return this.runCmd(`bit export --rewire --force`);
  }
  exportToCurrentScope(ids?: string) {
    return this.runCmd(`bit export ${CURRENT_UPSTREAM} ${ids || ''}`);
  }
  export(options = '') {
    // --force just silents the prompt, which obviously needed for CIs
    return this.runCmd(`bit export ${options} --force`);
  }
  resumeExport(exportId: string, remotes: string[]) {
    return this.runCmd(`bit resume-export ${exportId} ${remotes.join(' ')}`);
  }
  ejectComponents(ids: string, flags?: string) {
    return this.runCmd(`bit eject ${ids} ${flags || ''}`);
  }
  ejectComponentsParsed(ids: string, flags?: string) {
    const result = this.runCmd(`bit eject ${ids} ${flags || ''} --json`);
    const jsonStart = result.indexOf('{');
    const jsonResult = result.substring(jsonStart);
    return JSON.parse(jsonResult);
  }
  importComponent(id: string) {
    return this.runCmd(`bit import ${this.scopes.remote}/${id}`);
  }
  import(value = '') {
    return this.runCmd(`bit import ${value}`);
  }
  fetchLane(id: string) {
    return this.runCmd(`bit fetch ${id} --lanes`);
  }
  fetchRemoteLane(id: string) {
    return this.runCmd(`bit fetch ${this.scopes.remote}${LANE_REMOTE_DELIMITER}${id} --lanes`);
  }
  fetchAllLanes() {
    return this.runCmd(`bit fetch --lanes`);
  }
  importManyComponents(ids: string[]) {
    const idsWithRemote = ids.map((id) => `${this.scopes.remote}/${id}`);
    return this.runCmd(`bit import ${idsWithRemote.join(' ')}`);
  }

  importComponentWithOptions(id = 'bar/foo.js', options: Record<string, any>) {
    const value = Object.keys(options)
      .map((key) => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit import ${this.scopes.remote}/${id} ${value}`);
  }

  importAllComponents(writeToFileSystem = false) {
    return this.runCmd(`bit import ${writeToFileSystem ? '--merge' : ''}`);
  }

  isolateComponent(id: string, flags: string): string {
    const isolatedEnvOutput = this.runCmd(`bit isolate ${this.scopes.remote}/${id} ${this.scopes.remotePath} ${flags}`);
    const isolatedEnvOutputArray = isolatedEnvOutput.split('\n').filter((str) => str);
    return isolatedEnvOutputArray[isolatedEnvOutputArray.length - 1];
  }

  isolateComponentWithCapsule(id: string, capsuleDir: string) {
    return this.runCmd(`bit isolate ${id} --use-capsule --directory ${capsuleDir}`);
  }

  /**
   * returns the capsule dir in case there is --json flag
   */
  createCapsuleHarmony(id: string, options?: Record<string, any>): string {
    const parsedOpts = this.parseOptions(options);
    const output = this.runCmd(`bit capsule-create ${id} ${parsedOpts}`);
    if (options?.json || options?.j) {
      const capsules = JSON.parse(output);
      const capsule = capsules.find((c) => c.id.includes(id));
      if (!capsule)
        throw new Error(
          `createCapsuleHarmony unable to find capsule for ${id}, inside ${capsules.map((c) => c.id).join(', ')}`
        );
      return capsule.path;
    }
    return output;
  }

  getCapsuleOfComponent(id: string) {
    const capsulesJson = this.runCmd('bit capsule-list -j');
    const capsules = JSON.parse(capsulesJson);
    const idWithUnderScore = id.replace(/\//, '_');
    const capsulePath = capsules.capsules.find((c) => c.endsWith(idWithUnderScore));
    if (!capsulePath) throw new Error(`unable to find the capsule for ${id}`);
    return capsulePath;
  }

  importExtension(id: string) {
    return this.runCmd(`bit import ${id} --extension`);
  }

  build(id = '') {
    return this.runCmd(`bit build ${id}`);
  }

  buildComponentWithOptions(id = '', options: Record<string, any>, cwd: string = this.scopes.localPath) {
    const value = Object.keys(options)
      .map((key) => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit build ${id} ${value}`, cwd);
  }

  testComponent(id = '') {
    return this.runCmd(`bit test ${id}`);
  }

  testComponentWithOptions(id = '', options: Record<string, any>, cwd: string = this.scopes.localPath) {
    const value = Object.keys(options)
      .map((key) => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit test ${id} ${value}`, cwd);
  }

  status() {
    return this.runCmd('bit status');
  }

  statusJson() {
    const status = this.runCmd('bit status --json');
    return JSON.parse(status);
  }

  expectStatusToBeClean() {
    const statusJson = this.statusJson();
    Object.keys(statusJson).forEach((key) => {
      expect(statusJson[key], `status.${key} should be empty`).to.have.lengthOf(0);
    });
  }

  expectStatusToHaveIssue(issueName: string) {
    const allIssues = this.getAllIssuesFromStatus();
    expect(allIssues).to.include(issueName);
  }

  expectStatusToNotHaveIssue(issueName: string) {
    const allIssues = this.getAllIssuesFromStatus();
    expect(allIssues).to.not.include(issueName);
  }

  getAllIssuesFromStatus(): string[] {
    const statusJson = this.statusJson();
    return statusJson.componentsWithIssues.map((comp) => comp.issues.map((issue) => issue.type)).flat();
  }

  expectStatusToNotHaveIssues() {
    const statusJson = this.statusJson();
    ['componentsWithIssues', 'invalidComponents'].forEach((key) => {
      expect(statusJson[key], `status.${key} should be empty`).to.have.lengthOf(0);
    });
  }

  statusComponentIsStaged(id: string): boolean {
    const status = this.statusJson();
    return status.stagedComponents.includes(id);
  }

  statusComponentIsModified(id: string): boolean {
    const status = this.statusJson();
    return status.modifiedComponent.includes(id);
  }

  showComponent(id = 'bar/foo') {
    return this.runCmd(`bit show ${id}`);
  }

  showComponentParsed(id = 'bar/foo') {
    const output = this.runCmd(`bit show ${id} --json --legacy`);
    return JSON.parse(output);
  }

  getComponentFiles(id: string): string[] {
    const output = this.runCmd(`bit show ${id} --json`);
    const comp = JSON.parse(output);
    return comp.find((c) => c.title === 'files').json;
  }

  showComponentWithOptions(id = 'bar/foo', options: Record<string, any>) {
    const value = Object.keys(options)
      .map((key) => `-${key} ${options[key]}`)
      .join(' ');
    return this.runCmd(`bit show ${id} ${value}`);
  }

  checkoutVersion(version: string, ids: string, flags?: string, cwd?: string) {
    return this.runCmd(`bit checkout ${version} ${ids} ${flags || ''}`, cwd);
  }

  checkout(values: string) {
    return this.runCmd(`bit checkout ${values}`);
  }
  switchLocalLane(lane: string, flags?: string) {
    return this.runCmd(`bit switch ${lane} ${flags || ''}`);
  }
  switchRemoteLane(lane: string, flags?: string, getAll = true) {
    const getAllFlag = getAll ? '--get-all' : '';
    return this.runCmd(`bit switch ${lane} --remote ${this.scopes.remote} ${getAllFlag} ${flags || ''}`);
  }

  mergeVersion(version: string, ids: string, flags?: string) {
    return this.runCmd(`bit merge ${version} ${ids} ${flags || ''}`);
  }

  merge(values: string) {
    return this.runCmd(`bit merge ${values}`);
  }
  mergeLane(laneName: string, options = '') {
    return this.runCmd(`bit merge ${laneName} ${options} --lane`);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  diff(id? = '') {
    const output = this.runCmd(`bit diff ${id}`);
    return removeChalkCharacters(output);
  }
  log(id: string) {
    return this.runCmd(`bit log ${id}`);
  }
  move(from: string, to: string) {
    return this.runCmd(`bit move ${path.normalize(from)} ${path.normalize(to)}`);
  }
  runTask(taskName: string) {
    return this.runCmd(`bit run ${taskName}`);
  }
  create(templateName: string, componentName: string, flags = '') {
    return this.runCmd(`bit create ${templateName} ${componentName} ${flags}`);
  }
  moveComponent(id: string, to: string) {
    return this.runCmd(`bit move ${id} ${path.normalize(to)} --component`);
  }
  link(flags?: string) {
    return this.runCmd(`bit link ${flags || ''}`);
  }
  install(packages = '', options?: Record<string, any>) {
    const parsedOpts = this.parseOptions(options);
    return this.runCmd(`bit install ${packages} ${parsedOpts}`);
  }
  linkAndRewire(ids = '') {
    return this.runCmd(`bit link ${ids} --rewire`);
  }

  linkAndCompile(linkFlags?: string, compileId?: string, compileFlags?: Record<string, string>) {
    this.link(linkFlags);
    return this.compile(compileId, compileFlags);
  }

  packComponent(id: string, options: Record<string, any>, extract = false) {
    const defaultOptions = {
      o: '',
      p: '',
      k: '',
      j: '',
    };
    options = { ...defaultOptions, ...options };
    const value = Object.keys(options)
      .map((key) => `-${key} ${options[key]}`)
      .join(' ');
    const result = this.runCmd(`bit pack ${id} ${value}`);
    if (extract) {
      if (
        !options ||
        // We don't just check that it's falsy because usually it's an empty string.
        // eslint-disable-next-line no-prototype-builtins
        (!options.hasOwnProperty('-json') && !options.hasOwnProperty('j')) ||
        (!options['-out-dir'] && !options.d)
      ) {
        throw new Error('extracting supporting only when packing with json and out-dir');
      }
      let resultParsed;
      try {
        resultParsed = JSON.parse(result);
      } catch (e) {
        // TODO: this is a temp hack to remove the pnpm install line which looks something like
        // ...5c35e2f15af94460bf455f4c4e82b67991042 | Progress: resolved 19, reused 18, downloaded 0, added 0, doned 0
        // it should be resolved by controlling the pnpm output correctly and don't print it in json mode
        const firstCBracket = result.indexOf('{');
        const newResult = result.substring(firstCBracket);
        resultParsed = JSON.parse(newResult);
      }
      if (!resultParsed || !resultParsed.metadata.tarPath) {
        throw new Error('npm pack results are invalid');
      }

      const tarballFilePath = resultParsed.metadata.tarPath;
      // const dir = options.d || options['-out-dir'];
      const dir = path.dirname(tarballFilePath);
      if (this.debugMode) {
        console.log(`untaring the file ${tarballFilePath} into ${dir}`); // eslint-disable-line no-console
      }
      tar.x({ file: tarballFilePath, C: dir, sync: true });
    }
    return result;
  }
  publish(id: string, flags = '') {
    return this.runCmd(`bit publish ${id} ${flags}`);
  }
  ejectConf(id = 'bar/foo', options?: Record<string, any>) {
    const parsedOpts = this.parseOptions(options);
    return this.runCmd(`bit eject-conf ${id} ${parsedOpts}`);
  }

  compile(id = '', options?: Record<string, any>) {
    const parsedOpts = this.parseOptions(options);
    return this.runCmd(`bit compile ${id} ${parsedOpts}`);
  }

  injectConf(id = 'bar/foo', options: Record<string, any> | null | undefined) {
    const value = options
      ? Object.keys(options) // $FlowFixMe
          .map((key) => `-${key} ${options[key]}`)
          .join(' ')
      : '';
    return this.runCmd(`bit inject-conf ${id} ${value}`);
  }
  doctor(options: Record<string, any>) {
    const parsedOpts = this.parseOptions(options);
    return this.runCmd(`bit doctor ${parsedOpts}`);
  }

  doctorOne(diagnosisName: string, options: Record<string, any>, cwd?: string) {
    const parsedOpts = this.parseOptions(options);
    return this.runCmd(`bit doctor "${diagnosisName}" ${parsedOpts}`, cwd);
  }

  doctorList(options: Record<string, any>) {
    const parsedOpts = this.parseOptions(options);
    return this.runCmd(`bit doctor --list ${parsedOpts}`);
  }

  doctorJsonParsed() {
    const result = this.runCmd('bit doctor --json');
    return JSON.parse(result);
  }

  parseOptions(options?: Record<string, any>): string {
    if (!options) return ' ';
    const value = Object.keys(options)
      .map((key) => {
        const keyStr = key.length === 1 ? `-${key}` : `--${key}`;
        return `${keyStr} ${options[key]}`;
      })
      .join(' ');
    return value;
  }

  init(options = '') {
    return this.runCmd(`bit init ${options}`);
  }

  async runInteractiveCmd({
    args = [],
    inputs = [],
    // Options for the process (execa)
    processOpts = {
      cwd: this.scopes.localPath,
    },
    // opts for interactive
    opts = {
      defaultIntervalBetweenInputs: DEFAULT_DEFAULT_INTERVAL_BETWEEN_INPUTS,
      verbose: false,
    },
  }: {
    args: string[];
    inputs: InteractiveInputs;
    processOpts: Record<string, any>;
    opts: {
      // Default interval between inputs in case there is no specific interval
      defaultIntervalBetweenInputs: number;
      verbose: boolean;
    };
  }) {
    const processName = this.bitBin || 'bit';
    opts.verbose = !!this.debugMode;
    const { stdout } = await runInteractive({ processName, args, inputs, processOpts, opts });
    if (this.debugMode) {
      console.log(rightpad(chalk.green('output: \n'), 20, ' ')); // eslint-disable-line no-console
      console.log(chalk.cyan(stdout)); // eslint-disable-line no-console
    }
    return stdout;
  }
}
