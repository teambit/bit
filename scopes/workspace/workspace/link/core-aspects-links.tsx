import { CoreAspectLinkResult } from '@teambit/dependency-resolver';
import { Text, Box } from 'ink';
import React from 'react';

import { getPackageNameFromTarget } from './get-package-name-from-target';
import { LinkRow, VerboseLinkRow } from './link-row';

type CoreAspectsLinksProps = {
  coreAspectsLinks?: CoreAspectLinkResult[];
  verbose: boolean;
};

export function CoreAspectsLinks({ coreAspectsLinks, verbose = false }: CoreAspectsLinksProps) {
  if (!coreAspectsLinks || !coreAspectsLinks.length) {
    return <Text color="cyan">No core aspects were linked</Text>;
  }
  return (
    <Box key="core-aspect-links" flexDirection="column">
      <Text bold color="cyan">
        Core aspects links
      </Text>
      {coreAspectsLinks.map((link) => (
        <CoreAspectLinkRow key={link.aspectId} coreAspectLink={link} verbose={verbose} />
      ))}
    </Box>
  );
}

type CoreAspectLinkProps = {
  coreAspectLink: CoreAspectLinkResult;
  verbose: boolean;
};
function CoreAspectLinkRow({ coreAspectLink, verbose = false }: CoreAspectLinkProps) {
  if (verbose) return <VerboseCoreAspectLink coreAspectLink={coreAspectLink} />;
  return <RegularCoreAspectLink coreAspectLink={coreAspectLink} />;
}

type RegularCoreAspectLinkProps = {
  coreAspectLink: CoreAspectLinkResult;
};
function RegularCoreAspectLink({ coreAspectLink }: RegularCoreAspectLinkProps) {
  const id = coreAspectLink.aspectId.toString();
  const packagePath = getPackageNameFromTarget(coreAspectLink.linkDetail.to);
  return <LinkRow title={id} target={packagePath} padding={50} />;
}

type VerboseCoreAspectLinkProps = {
  coreAspectLink: CoreAspectLinkResult;
};
function VerboseCoreAspectLink({ coreAspectLink }: VerboseCoreAspectLinkProps) {
  const id = coreAspectLink.aspectId.toString();
  return (
    <Box key={id} flexDirection="column">
      <Text bold color="cyan">
        {id}
      </Text>
      <VerboseLinkRow from={coreAspectLink.linkDetail.from} to={coreAspectLink.linkDetail.to} />
    </Box>
  );
}
