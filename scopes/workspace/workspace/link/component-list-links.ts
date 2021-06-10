import chalk from 'chalk';
import { LinksResult as LegacyLinksResult } from '@teambit/legacy/dist/links/node-modules-linker';
import { getPackageNameFromTarget } from './get-package-name-from-target';
import { LinkRow, VerboseLinkRow } from './link-row';

type ComponentListLinksProps = {
  componentListLinks?: LegacyLinksResult[];
  verbose: boolean;
};

export function ComponentListLinks({ componentListLinks, verbose = false }: ComponentListLinksProps) {
  if (!componentListLinks || !componentListLinks.length) {
    return chalk.cyan('No components link were generated');
  }
  const title = chalk.bold.cyan('Components links');
  const links = componentListLinks.map((componentLinks) => ComponentLinks({ componentLinks, verbose })).join('\n');

  return `${title}\n${links}`;
}

type ComponentLinksProps = {
  componentLinks: LegacyLinksResult;
  verbose: boolean;
};
function ComponentLinks({ componentLinks, verbose = false }: ComponentLinksProps) {
  if (!componentLinks.bound || componentLinks.bound.length < 1) return '';
  if (verbose) return VerboseComponentLinks({ componentLinks });
  return RegularComponentLinks({ componentLinks });
}

type RegularComponentLinksProps = {
  componentLinks: LegacyLinksResult;
};
function RegularComponentLinks({ componentLinks }: RegularComponentLinksProps) {
  const id = componentLinks.id.toString();
  if (!componentLinks.bound || componentLinks.bound.length < 1) return '';
  const packagePath = getPackageNameFromTarget(componentLinks.bound[0].to);
  return LinkRow({ title: id, target: packagePath, padding: 50 });
}

type VerboseComponentLinksProps = {
  componentLinks: LegacyLinksResult;
};
function VerboseComponentLinks({ componentLinks }: VerboseComponentLinksProps) {
  const id = componentLinks.id.toString();
  if (!componentLinks.bound || componentLinks.bound.length < 1) return '';
  const title = chalk.bold.cyan(id);
  const links = componentLinks.bound.map((link) => VerboseLinkRow({ from: link.from, to: link.to })).join('\n');
  return `${title}\n${links}\n`;
}
