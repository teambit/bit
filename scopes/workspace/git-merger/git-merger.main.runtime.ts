import fs from 'fs-extra';
import { BitError } from '@teambit/bit-error';
import gitconfig from 'gitconfig';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { GitMergerAspect } from './git-merger.aspect';
import { MergeBitmapsCmd } from './merge-bitmaps.cmd';
import { SetGitMergeDriverCmd } from './set-git-merge-driver.cmd';

type SetGitMergeDriverOpts = {
  global?: boolean;
};

const GIT_BASE_KEY = 'merge.bitmap-driver';
const GIT_NAME_KEY = `${GIT_BASE_KEY}.name`;
const GIT_DRIVER_KEY = `${GIT_BASE_KEY}.driver`;

const GIT_NAME_VALUE = 'A custom merge driver used to resolve conflicts in .bitmap files';
const GIT_DRIVER_VALUE = 'bd merge-bitmaps %O %A %B';

const GIT_ATTRIBUTES = '.bitmap merge=bitmap-driver';

export class GitMergerMain {
  constructor(private workspace: Workspace) {}

  async mergeBitmaps(ancestor: string, current: string, other: string) {
    const encoding = 'utf-8';
    // const ancestorContent = this.stripBom(fs.readFileSync(ancestor, encoding));
    const currentContent = this.stripBom(fs.readFileSync(current, encoding));
    const otherContent = this.stripBom(fs.readFileSync(other, encoding));
    const merged = this.workspace.bitMap.mergeBitmaps(currentContent, otherContent);
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
    const isGit = await fs.pathExists('.git');
    if (!isGit && !opts.global) {
      throw new BitError('This is not a git repository');
    }
    const fileExist = await fs.pathExists('.gitattributes');
    if (!fileExist) {
      await fs.writeFile('.gitattributes', GIT_ATTRIBUTES);
    } else {
      const gitAttributes = await fs.readFile('.gitattributes', 'utf8');
      if (gitAttributes.includes(GIT_ATTRIBUTES)) {
        return; // already set
      }
      await fs.appendFile('.gitattributes', `\n${GIT_ATTRIBUTES}`);
    }
  }

  private stripBom(str) {
    return str[0] === '\uFEFF' ? str.slice(1) : str;
  }

  static slots = [];
  // define your aspect dependencies here.
  // in case you need to use another aspect API.
  static dependencies = [CLIAspect, WorkspaceAspect];

  static runtime = MainRuntime;

  static async provider([cli, workspace]: [CLIMain, Workspace]) {
    const gitMergerMain = new GitMergerMain(workspace);
    cli.register(new SetGitMergeDriverCmd(gitMergerMain), new MergeBitmapsCmd(gitMergerMain));
    return gitMergerMain;
  }
}

GitMergerAspect.addRuntime(GitMergerMain);

export default GitMergerMain;
