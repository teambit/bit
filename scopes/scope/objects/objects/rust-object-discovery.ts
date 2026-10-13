import fs from 'fs';
import path from 'path';
import {
  OBJECT_IMPORT_VERSION,
  readPackagedFile,
  validObjectSelection,
  packagedObjectTarget,
  objectRuntimeMatches,
  objectArtifactExecutable,
  objectArtifactAddon,
} from './rust-object-package';

/** Search only beside this installed runtime. Never search PATH, a workspace, or the network. */
export function resolveRustObjectImportExecutable(context: 'read' | 'import' = 'read'): string | undefined {
  const configured =
    process.env.BIT_RUST_OBJECT_IMPORT || (process.env.BIT_RUST_CLIENT_VCS === 'on' ? 'packaged' : undefined);
  if (!configured || configured === 'off') return undefined;
  if (configured !== 'packaged') return path.isAbsolute(configured) ? path.toNamespacedPath(configured) : undefined;
  try {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 13)) return undefined;
    const target = packagedObjectTarget();
    if (!target) return undefined;
    const root = path.join(__dirname, 'packaged');
    if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) return undefined;
    const selection = JSON.parse(readPackagedFile(path.join(root, 'selection.json'), 4096).toString('utf8')).current;
    if (!validObjectSelection(selection) || selection.target !== target) return undefined;
    // Explicit fields prevent unused selector data from becoming part of the build identity.
    const chosen = { version: selection.version, target: selection.target, revision: selection.revision };
    const directory = path.join(root, OBJECT_IMPORT_VERSION, target, chosen.revision);
    if (fs.realpathSync(directory) !== path.join(fs.realpathSync(root), OBJECT_IMPORT_VERSION, target, chosen.revision))
      return undefined;
    const manifestBytes = readPackagedFile(path.join(directory, 'manifest.json'), 65536);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (!objectRuntimeMatches(__dirname, manifestBytes, manifest, chosen, context === 'import')) return undefined;
    return objectArtifactExecutable(directory, manifest, chosen);
  } catch {
    return undefined;
  }
}

/** Optional verified companion; unsupported or damaged addons keep the existing child helper. */
export function resolveRustWorkspaceAddon(executable: string): string | undefined {
  if (!/^bit-object-import(?:\.exe)?$/.test(path.basename(executable)) || !fs.existsSync(executable)) return undefined;
  const override = process.env.BIT_TEST_WORKSPACE_ADDON;
  if (override) return path.isAbsolute(override) ? override : undefined;
  if (!fs.existsSync(path.join(path.dirname(executable), 'bit-workspace.node'))) return undefined;
  try {
    return objectArtifactAddon(executable);
  } catch {
    return undefined;
  }
}
