import fs from 'fs-extra';
import { BitError } from '@teambit/bit-error';
import { homedir } from 'os';
import { join } from 'path';
import gitconfig from '@teambit/gitconfig';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { WorkspaceAspect, Workspace, BitmapMergeOptions } from '@teambit/workspace';
import { GitAspect } from './git.aspect';
import { MergeBitmapsCmd } from './merge-bitmaps.cmd';
import { SetGitMergeDriverCmd } from './set-git-merge-driver.cmd';
import { GitCmd } from './git.cmd';

type SetGitMergeDriverOpts = {
  global?: boolean;
};

const GIT_BASE_KEY = 'merge.bitmap-driver';
const GIT_NAME_KEY = `${GIT_BASE_KEY}.name`;
const GIT_DRIVER_KEY = `${GIT_BASE_KEY}.driver`;

const GIT_NAME_VALUE = 'A custom merge driver used to resolve conflicts in .bitmap files';
// const binName = process.argv[1];
const GIT_DRIVER_VALUE = 'bd git merge-bitmaps %O %A %B';

const GIT_ATTRIBUTES = '.bitmap merge=bitmap-driver';

export interface GitExtWorkspaceConfig {
  mergeStrategy: 'ours' | 'theirs' | 'manual';
}
export class GitMain {
  constructor(
    private workspace: Workspace,
    /**
     * Git extension configuration.
     */
    readonly config: GitExtWorkspaceConfig
  ) {}

  async mergeBitmaps(ancestor: string, current: string, other: string) {
    const encoding = 'utf-8';
    // const ancestorContent = this.stripBom(fs.readFileSync(ancestor, encoding));
    const currentContent = this.stripBom(fs.readFileSync(current, encoding));
    const otherContent = this.stripBom(fs.readFileSync(other, encoding));
    const opts: BitmapMergeOptions = {
      mergeStrategy: this.config.mergeStrategy || 'manual',
    };
    const merged = this.workspace.bitMap.mergeBitmaps(currentContent, otherContent, opts);
    await fs.outputFile(current, merged);
    return merged;
  }

  async setGitMergeDriver(opts: SetGitMergeDriverOpts) {
    await this.setGitConfig(opts);
    await this.setGitAttributes(opts);
    return true;
  }

  private async setGitConfig(opts: SetGitMergeDriverOpts) {
    const isGit = await fs.pathExists('.git');
    if (!isGit && !opts.global) {
      throw new BitError('This is not a git repository');
    }
    const location = opts.global ? 'global' : 'local';
    let gitVal;
    try {
      gitVal = await gitconfig.get(GIT_NAME_KEY, { location });
    } catch {
      // do nothing, it just means that there is no config yet which is fine
    }
    if (gitVal) {
      return; // already set
    }
    await gitconfig.set(GIT_NAME_KEY, GIT_NAME_VALUE, { location });
    await gitconfig.set(GIT_DRIVER_KEY, GIT_DRIVER_VALUE, { location });
  }

  private async setGitAttributes(opts: SetGitMergeDriverOpts) {
    const attributesPath = await this.getGitAttributesPath(opts.global);
    const isGit = await fs.pathExists('.git');
    if (!isGit && !opts.global) {
      throw new BitError('This is not a git repository');
    }
    const fileExist = await fs.pathExists(attributesPath);
    if (!fileExist) {
      await fs.writeFile(attributesPath, GIT_ATTRIBUTES);
    } else {
      const gitAttributes = await fs.readFile(attributesPath, 'utf8');
      if (gitAttributes.includes(GIT_ATTRIBUTES)) {
        return; // already set
      }
      await fs.appendFile(attributesPath, `\n${GIT_ATTRIBUTES}`);
    }
  }

  private async getGitAttributesPath(global = false) {
    const fromConfig = await gitconfig.get('core.attributesFile', { location: global ? 'global' : 'local' });
    if (fromConfig) {
      return fromConfig;
    }
    if (!global) {
      return '.gitattributes';
    }
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    if (xdgConfigHome) {
      return join(xdgConfigHome, 'git', 'attributes');
    }
    return join(homedir(), '.config', 'git', 'attributes');
  }

  private stripBom(str) {
    return str[0] === '\uFEFF' ? str.slice(1) : str;
  }

  static slots = [];
  // define your aspect dependencies here.
  // in case you need to use another aspect API.
  static dependencies = [CLIAspect, WorkspaceAspect];

  static runtime = MainRuntime;

  static async provider([cli, workspace]: [CLIMain, Workspace], config: GitExtWorkspaceConfig) {
    const gitMain = new GitMain(workspace, config);
    const gitCmd = new GitCmd();
    gitCmd.commands = [new SetGitMergeDriverCmd(gitMain), new MergeBitmapsCmd(gitMain)];
    cli.register(gitCmd);
    cli.registerGroup('git', 'Git');
    return gitMain;
  }
}

GitAspect.addRuntime(GitMain);

export default GitMain;
