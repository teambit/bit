import { Text, Box } from 'ink';
import React from 'react';
import { NestedNMDepsLinksResult } from '@teambit/dependency-resolver';
import { VerboseLinkRow } from './link-row';

type NestedComponentLinksLinksProps = {
  nestedDepsInNmLinks?: NestedNMDepsLinksResult[];
  verbose: boolean;
};

export function NestedComponentLinksLinks({ nestedDepsInNmLinks, verbose = false }: NestedComponentLinksLinksProps) {
  if (!verbose) return null;
  if (!nestedDepsInNmLinks || !nestedDepsInNmLinks.length) {
    return null;
  }
  return (
    <Box key="nested-links" flexDirection="column">
      <Text bold color="cyan">
        Nested dependencies links
      </Text>
      {nestedDepsInNmLinks.map((nestedComponentLinks) => (
        <NestedComponentLinks
          key={nestedComponentLinks.componentId.toString()}
          nestedComponentLinks={nestedComponentLinks}
          verbose={verbose}
        />
      ))}
    </Box>
  );
}

type NestedComponentLinksProps = {
  nestedComponentLinks: NestedNMDepsLinksResult;
  verbose: boolean;
};
function NestedComponentLinks({ nestedComponentLinks, verbose = false }: NestedComponentLinksProps) {
  if (!nestedComponentLinks.linksDetail || nestedComponentLinks.linksDetail.length < 1) return null;
  if (verbose) return <VerboseNestedComponentLinks nestedComponentLinks={nestedComponentLinks} />;
  return null;
}

type VerboseNestedComponentLinksProps = {
  nestedComponentLinks: NestedNMDepsLinksResult;
};
function VerboseNestedComponentLinks({ nestedComponentLinks }: VerboseNestedComponentLinksProps) {
  const id = nestedComponentLinks.componentId.toString();
  if (!nestedComponentLinks.linksDetail || nestedComponentLinks.linksDetail.length < 1) return null;
  return (
    <Box key={id} flexDirection="column">
      <Text bold color="cyan">
        {id}
      </Text>
      {nestedComponentLinks.linksDetail.map((link) => (
        <VerboseLinkRow key={`${link.from}-${link.to}`} from={link.from} to={link.to} />
      ))}
    </Box>
  );
}
