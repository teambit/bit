import { CoreAspectLinkResult } from '@teambit/dependency-resolver';
import chalk from 'chalk';

import { getPackageNameFromTarget } from './get-package-name-from-target';
import { LinkRow, VerboseLinkRow } from './link-row';

type CoreAspectsLinksProps = {
  coreAspectsLinks?: CoreAspectLinkResult[];
  verbose: boolean;
};

export function CoreAspectsLinks({ coreAspectsLinks, verbose = false }: CoreAspectsLinksProps) {
  if (!coreAspectsLinks || !coreAspectsLinks.length) {
    return chalk.cyan('No core aspects were linked');
  }
  const title = chalk.cyan('Core aspects links');
  const links = coreAspectsLinks.map((link) => CoreAspectLinkRow({ coreAspectLink: link, verbose })).join('\n');
  return `${title}\n${links}`;
}

type CoreAspectLinkProps = {
  coreAspectLink: CoreAspectLinkResult;
  verbose: boolean;
};
function CoreAspectLinkRow({ coreAspectLink, verbose = false }: CoreAspectLinkProps) {
  if (verbose) return VerboseCoreAspectLink({ coreAspectLink });
  return RegularCoreAspectLink({ coreAspectLink });
}

type RegularCoreAspectLinkProps = {
  coreAspectLink: CoreAspectLinkResult;
};
function RegularCoreAspectLink({ coreAspectLink }: RegularCoreAspectLinkProps) {
  const id = coreAspectLink.aspectId.toString();
  const packagePath = getPackageNameFromTarget(coreAspectLink.linkDetail.to);
  return LinkRow({ title: id, target: packagePath, padding: 50 });
}

type VerboseCoreAspectLinkProps = {
  coreAspectLink: CoreAspectLinkResult;
};
function VerboseCoreAspectLink({ coreAspectLink }: VerboseCoreAspectLinkProps) {
  const id = coreAspectLink.aspectId.toString();
  const title = chalk.bold.cyan(id);
  const link = VerboseLinkRow({
    from: coreAspectLink.linkDetail.from,
    to: coreAspectLink.linkDetail.to,
  });
  return `${title}\n${link}`;
}
