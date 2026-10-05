type HiddenPeers = {
  forEach(predicate: (dependency: { getPackageName?: () => string }) => void): void;
};

export function removeHiddenPeerDependencies(packageJson: Record<string, any>, hiddenPeers: HiddenPeers) {
  const peerDependencies = packageJson.peerDependencies;
  const peerDependenciesMeta = packageJson.peerDependenciesMeta;
  hiddenPeers.forEach((dependency) => {
    const packageName = dependency.getPackageName?.();
    if (!packageName) return;
    if (peerDependencies) delete peerDependencies[packageName];
    if (peerDependenciesMeta) delete peerDependenciesMeta[packageName];
  });
}
