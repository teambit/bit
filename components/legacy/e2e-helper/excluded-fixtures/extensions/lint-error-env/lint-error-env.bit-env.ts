// @bit-no-check
// @ts-nocheck
import { OxlintLinter } from '@teambit/oxc.linter.oxlint-linter';

export class LintErrorEnv {
  name = 'lint-error-env';

  // a linter whose correctness-category offenses are reported as ERRORS (the stock envs report
  // everything as warnings, which never fails "bit validate"). the explicit `any` return type
  // avoids TS2742 (inferred type not portable) in the consuming workspace's type-check.
  linter(): any {
    return OxlintLinter.from({
      oxlintNodeOptions: {
        configPath: require.resolve('./config/oxlintrc.json'),
      },
    });
  }
}

export default new LintErrorEnv();
