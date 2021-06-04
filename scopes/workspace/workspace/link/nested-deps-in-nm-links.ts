import chalk from 'chalk';
import { NestedNMDepsLinksResult } from '@teambit/dependency-resolver';
import { VerboseLinkRow } from './link-row';

type NestedComponentLinksLinksProps = {
  nestedDepsInNmLinks?: NestedNMDepsLinksResult[];
  verbose: boolean;
};

export function NestedComponentLinksLinks({ nestedDepsInNmLinks, verbose = false }: NestedComponentLinksLinksProps) {
  if (!verbose) return '';
  if (!nestedDepsInNmLinks || !nestedDepsInNmLinks.length) {
    return '';
  }
  const title = chalk.bold.cyan('Nested dependencies links');
  const links = nestedDepsInNmLinks
    .map((nestedComponentLinks) =>
      NestedComponentLinks({
        nestedComponentLinks,
        verbose,
      })
    )
    .join('\n');
  return `${title}\n${links}\n`;
}

type NestedComponentLinksProps = {
  nestedComponentLinks: NestedNMDepsLinksResult;
  verbose: boolean;
};
function NestedComponentLinks({ nestedComponentLinks, verbose = false }: NestedComponentLinksProps) {
  if (!nestedComponentLinks.linksDetail || nestedComponentLinks.linksDetail.length < 1) return '';
  if (verbose) return VerboseNestedComponentLinks({ nestedComponentLinks });
  return '';
}

type VerboseNestedComponentLinksProps = {
  nestedComponentLinks: NestedNMDepsLinksResult;
};
function VerboseNestedComponentLinks({ nestedComponentLinks }: VerboseNestedComponentLinksProps) {
  const id = nestedComponentLinks.componentId.toString();
  const title = chalk.cyan.bold(id);
  const links = nestedComponentLinks.linksDetail
    .map((link) => VerboseLinkRow({ from: link.from, to: link.to }))
    .join('\n');
  return `${title}\n${links}\n`;
}
