import { ApplicationAspect } from './application.aspect';
import type { Application } from './application';
import { AppsBuildTask, BUILD_TASK } from './build-application.task';

export const BUILD_PLATFORM_TASK = 'build_platform_application';

/**
 * a build task dedicated to "platform" apps — apps that bundle other apps' build artifacts.
 *
 * declared as a task-level dependency on `build_application`, so the pipeline runs every env's
 * `build_application` first and only then comes back to run this task. by that point each env has
 * produced its app-bundle artifact (frontend bundles, backend bundles, etc.) in its capsule, so a
 * platform's bundler can read them regardless of the env iteration order.
 *
 * see `Application.platform` for the per-app opt-in.
 */
export class PlatformAppsBuildTask extends AppsBuildTask {
  name = BUILD_PLATFORM_TASK;
  dependencies = [`${ApplicationAspect.id}:${BUILD_TASK}`];

  protected shouldRunForApp(app: Application): boolean {
    return app.platform === true;
  }
}
