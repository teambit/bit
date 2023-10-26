import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { BuildContext, BuildTask, BuiltTaskResult, TaskLocation } from '@teambit/builder';
import { Capsule } from '@teambit/isolator';
import { Logger } from '@teambit/logger';
import { UIRoot, UiMain } from '@teambit/ui';
import { PreviewAspect } from '@teambit/preview';
import { promisify } from 'util';
import webpack from 'webpack';
import { sha1 } from '@teambit/legacy/dist/utils';
import createPreBundleConfig from './webpack/webpack.prebundle.config';
import { getEntryForPreBundlePreview } from './pre-bundle-preview';

export const PRE_BUNDLE_PREVIEW_TASK_NAME = 'PreBundlePreview';
export const PRE_BUNDLE_PREVIEW_DIR = 'preview-pre-bundle';
export const PRE_BUNDLE_PREVIEW_HASH_FILENAME = '.hash';

async function build(uiMain: UiMain, logger: Logger, outputPath: string): Promise<webpack.Stats | undefined> {
  logger.debug(`pre-bundle for preview: start`);
  const ui = uiMain.getUi();
  if (!ui) throw new Error('ui not found');
  const [rootExtensionName, uiRoot] = ui;
  const resolvedAspects = await uiRoot.resolveAspects('preview');
  const mainEntry = getEntryForPreBundlePreview(resolvedAspects, rootExtensionName, 'preview', PreviewAspect.id);
  const config = createPreBundleConfig(outputPath, mainEntry);

  const compiler = webpack(config);
  logger.debug(`pre-bundle for preview: running webpack`);
  const compilerRun = promisify(compiler.run.bind(compiler));
  const results = await compilerRun();

  logger.debug(`pre-bundle for preview: completed webpack`);
  if (!results) throw new Error('unknown error during pre-bundle for preview');
  if (results?.hasErrors()) {
    clearConsole();
    throw new Error(results?.toString());
  }

  return results;
}

async function createBundleUiHash(uiRoot: UIRoot): Promise<string> {
  const aspects = await uiRoot.resolveAspects('preview');
  aspects.sort((a, b) => ((a.getId || a.aspectPath) > (b.getId || b.aspectPath) ? 1 : -1));
  const aspectIds = aspects.map((aspect) => aspect.getId || aspect.aspectPath);
  return sha1(aspectIds.join(''));
}

function clearConsole() {
  process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
}

export class PreBundlePreviewTask implements BuildTask {
  aspectId = 'teambit.preview/preview';
  name = PRE_BUNDLE_PREVIEW_TASK_NAME;
  location: TaskLocation = 'end';

  constructor(private ui: UiMain, private logger: Logger) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const capsule: Capsule | undefined = context.capsuleNetwork.seedersCapsules.find(
      (c) => c.component.id.toStringWithoutVersion() === PreviewAspect.id
    );
    if (!capsule) {
      return { componentsResults: [] };
    }

    try {
      const outputPath = join(capsule.path, PreBundlePreviewTask.getArtifactDirectory());
      this.logger.info(`Generating Preview pre-bundle at ${outputPath}...`);
      await build(this.ui, this.logger, outputPath);
      await this.generateHash(outputPath);
    } catch (error) {
      this.logger.error('Generating Preview pre-bundle failed');
      throw new Error('Generating Preview pre-bundle failed');
    }
    const artifacts = PreBundlePreviewTask.getArtifactDef();
    return {
      componentsResults: [],
      artifacts,
    };
  }

  private async generateHash(outputPath: string): Promise<void> {
    const maybeUiRoot = this.ui.getUi();
    if (!maybeUiRoot) throw new Error('no uiRoot found');

    const [, uiRoot] = maybeUiRoot;
    const hash = await createBundleUiHash(uiRoot);

    if (!existsSync(outputPath)) mkdirSync(outputPath);
    writeFileSync(join(outputPath, PRE_BUNDLE_PREVIEW_HASH_FILENAME), hash);
  }

  static getArtifactDirectory() {
    return join('artifacts', PRE_BUNDLE_PREVIEW_DIR);
  }

  static getArtifactDef() {
    const workspaceRootDir = PreBundlePreviewTask.getArtifactDirectory();
    return [
      {
        name: `${PRE_BUNDLE_PREVIEW_DIR}`,
        globPatterns: [`${workspaceRootDir}/**`],
      },
    ];
  }
}
