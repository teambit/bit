import { Text, Box } from 'ink';
import React from 'react';
import { LinksResult as LegacyLinksResult } from '@teambit/legacy/dist/links/node-modules-linker';
import { getPackageNameFromTarget } from './get-package-name-from-target';
import { LinkRow, VerboseLinkRow } from './link-row';

type ComponentListLinksProps = {
  componentListLinks?: LegacyLinksResult[];
  verbose: boolean;
};

export function ComponentListLinks({ componentListLinks, verbose = false }: ComponentListLinksProps) {
  if (!componentListLinks || !componentListLinks.length) {
    return <Text color="cyan">No components link were generated</Text>;
  }
  return (
    <Box key="components-links" flexDirection="column">
      <Text bold color="cyan">
        Components links
      </Text>
      {componentListLinks.map((componentLinks) => (
        <ComponentLinks key={componentLinks.id.toString()} componentLinks={componentLinks} verbose={verbose} />
      ))}
    </Box>
  );
}

type ComponentLinksProps = {
  componentLinks: LegacyLinksResult;
  verbose: boolean;
};
function ComponentLinks({ componentLinks, verbose = false }: ComponentLinksProps) {
  if (!componentLinks.bound || componentLinks.bound.length < 1) return null;
  if (verbose) return <VerboseComponentLinks componentLinks={componentLinks} />;
  return <RegularComponentLinks componentLinks={componentLinks} />;
}

type RegularComponentLinksProps = {
  componentLinks: LegacyLinksResult;
};
function RegularComponentLinks({ componentLinks }: RegularComponentLinksProps) {
  const id = componentLinks.id.toString();
  if (!componentLinks.bound || componentLinks.bound.length < 1) return null;
  const packagePath = getPackageNameFromTarget(componentLinks.bound[0].to);
  return <LinkRow title={id} target={packagePath} padding={50} />;
}

type VerboseComponentLinksProps = {
  componentLinks: LegacyLinksResult;
};
function VerboseComponentLinks({ componentLinks }: VerboseComponentLinksProps) {
  const id = componentLinks.id.toString();
  if (!componentLinks.bound || componentLinks.bound.length < 1) return null;
  return (
    <Box key={id} flexDirection="column">
      <Text bold color="cyan">
        {id}
      </Text>
      {componentLinks.bound.map((link) => (
        <VerboseLinkRow key={`${link.from}-${link.to}`} from={link.from} to={link.to} />
      ))}
    </Box>
  );
}
