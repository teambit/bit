import type { Lane } from '@teambit/objects';
import { logger } from '@teambit/legacy.logger';
import type { ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import {
  ArtifactFiles,
  deserializeArtifactFiles,
  getArtifactFilesByExtension,
  getRefsFromExtensions,
} from '@teambit/component.sources';
import { MissingObjects } from '../exceptions';
import type Scope from '../scope';

export async function importMultipleDistsArtifacts(scope: Scope, components: Component[]) {
  logger.debug(
    `importMultipleDistsArtifacts: ${components.length} components: ${components
      .map((c) => c.id.toString())
      .join(', ')}`
  );
  const extensionsNamesForDistArtifacts = 'teambit.compilation/compiler';
  const lane = await scope.getCurrentLaneObject();
  const scopeComponentsImporter = scope.scopeImporter;
  const groupedHashes: { [scopeName: string]: string[] } = {};
  const debugHashesOrigin = {};
  await Promise.all(
    components.map(async (component) => {
      const artifactsFiles = getArtifactFilesByExtension(component.extensions, extensionsNamesForDistArtifacts);
      const isIdOnLane = await scope.isIdOnLane(component.id, lane, false);
      const getScopes = () => {
        if (isIdOnLane === null) {
          // we're not sure wether it's on the lane or not. try to fetch from both.
          return [lane?.scope as string, component.scope as string];
        }
        return isIdOnLane ? [lane?.scope as string] : [component.scope as string];
      };
      const scopes = getScopes();
      artifactsFiles.forEach((artifactFiles) => {
        if (!artifactFiles) return;
        if (!(artifactFiles instanceof ArtifactFiles)) {
          artifactFiles = deserializeArtifactFiles(artifactFiles);
        }
        if (artifactFiles.isEmpty()) return;
        if (artifactFiles.vinyls.length) return;
        const allHashes = artifactFiles.refs.map((artifact) => artifact.ref.hash);
        scopes.forEach((scopeName) => (groupedHashes[scopeName] ||= []).push(...allHashes));
        allHashes.forEach(
          (hash) => (debugHashesOrigin[hash] = `id: ${component.id.toString()}. isIdOnLane: ${isIdOnLane}`)
        );
      });
    })
  );
  try {
    await scopeComponentsImporter.importManyObjects(
      groupedHashes,
      `to get dists artifacts for ${components.length} components`
    );
  } catch (err) {
    logger.error('failed fetching the following hashes', { groupedHashes, debugHashesOrigin });
    throw err;
  }
  logger.debug(`importMultipleDistsArtifacts: ${components.length} components. completed successfully`);
}

export async function importAllArtifactsFromLane(scope: Scope, components: Component[], lane: Lane) {
  logger.debug(
    `importAllArtifactsFromLane: ${components.length} components: ${components.map((c) => c.id.toString()).join(', ')}`
  );
  const scopeComponentsImporter = scope.scopeImporter;
  const groupedHashesOnLane: { [scopeName: string]: string[] } = {};
  const groupedHashesFromMain: { [scopeName: string]: string[] } = {};
  const debugHashesOrigin = {};
  groupedHashesOnLane[lane.scope] = [];
  components.forEach((component) => {
    const artifactsRefs = getRefsFromExtensions(component.extensions);
    const artifactsRefsStr = artifactsRefs.map((ref) => ref.hash);
    groupedHashesOnLane[lane.scope].push(...artifactsRefsStr);
    if (lane.scope !== component.scope) {
      (groupedHashesFromMain[component.scope as string] ||= []).push(...artifactsRefsStr);
    }
    artifactsRefsStr.forEach(
      (hash) => (debugHashesOrigin[hash] = `id: ${component.id.toString()}. will try both lane and main`)
    );
  });
  let errorFromLane: MissingObjects | undefined;
  try {
    await scopeComponentsImporter.importManyObjects(
      groupedHashesOnLane,
      `to get all artifacts for ${components.length} components from lane ${lane.id()}`
    );
  } catch (err: any) {
    logger.error('failed fetching the following hashes from the lane', {
      groupedHashes: groupedHashesOnLane,
      debugHashesOrigin,
    });
    if (err instanceof MissingObjects) {
      errorFromLane = err;
    } else throw err;
  }

  if (errorFromLane) {
    if (!Object.keys(groupedHashesFromMain).length) throw errorFromLane;
    const groupHashesFallBack: { [scopeName: string]: string[] } = {};
    const missing = errorFromLane.hashesPerRemotes;
    Object.keys(groupedHashesFromMain).forEach((scopeName) => {
      groupHashesFallBack[scopeName] = groupedHashesFromMain[scopeName].filter((hash) => missing[hash]);
    });
    try {
      await scopeComponentsImporter.importManyObjects(
        groupHashesFallBack,
        `to get all artifacts for ${components.length} components from main`
      );
    } catch (err: any) {
      logger.error('failed fetching the following hashes from both lane and main', {
        groupedHashes: groupedHashesOnLane,
        debugHashesOrigin,
      });
      if (err instanceof MissingObjects) {
        const currentMissing = err.hashesPerRemotes;
        const hashesPerRemotes = Object.keys(currentMissing).reduce((acc, curr) => {
          acc[curr] = [...missing[curr], ...currentMissing[curr]];
          return acc;
        }, {});
        throw new MissingObjects(hashesPerRemotes);
      }
      throw err;
    }
  }

  logger.debug(`importAllArtifactsFromLane: ${components.length} components. completed successfully`);
}
