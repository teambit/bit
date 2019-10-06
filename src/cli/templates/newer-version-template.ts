import { NewerVersion } from '../../consumer/exceptions/newer-version-found';

const helpPhrase =
  'use checkout to merge latest versions with current changes. you can also tag current changes as a newer version with the --ignore-newest-version flag';

export default function newerVersionTemplate(newerVersions: NewerVersion[]) {
  function formatOne(newerVersion) {
    return `unable to tag ${newerVersion.componentId}
current version ${newerVersion.currentVersion} is older than the latest ${newerVersion.latestVersion}.`;
  }

  const result = `${newerVersions.map(formatOne).join('\n')}\n${helpPhrase}`;
  return result;
}
