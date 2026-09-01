type HiddenPeers = {
  forEach(predicate: (dependency: { getPackageName?: () => string }) => void): void;
};

export function removeHiddenPeerDependencies(packageJson: Record<string, any>, hiddenPeers: HiddenPeers) {
  const peerDependencies = packageJson.peerDependencies;
  if (!peerDependencies) return;
  hiddenPeers.forEach((dependency) => {
    const packageName = dependency.getPackageName?.();
    if (packageName) delete peerDependencies[packageName];
  });
}
