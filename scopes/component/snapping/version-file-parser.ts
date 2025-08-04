import fs from 'fs-extra';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import type { TagDataPerComp } from './snapping.main.runtime';

export class VersionFileParser {
  constructor(private componentsToTag: ComponentIdList) {}

  async parseVersionsFile(filePath: string): Promise<TagDataPerComp[]> {
    if (!(await fs.pathExists(filePath))) {
      throw new BitError(`versions file not found: ${filePath}`);
    }

    const fileContent = await fs.readFile(filePath, 'utf-8');
    return this.parseVersionsContent(fileContent);
  }

  parseVersionsContent(fileContent: string): TagDataPerComp[] {
    const lines = fileContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    const results: TagDataPerComp[] = [];
    let defaultVersion: string | undefined;

    // Create a map for faster component lookup
    const componentsByName = new Map<string, ComponentID>();
    for (const comp of this.componentsToTag) {
      componentsByName.set(comp.toStringWithoutVersion(), comp);
    }

    for (const line of lines) {
      // Handle default version
      if (line.startsWith('DEFAULT:')) {
        defaultVersion = line.replace('DEFAULT:', '').trim();
        if (!defaultVersion) {
          throw new BitError('DEFAULT version cannot be empty');
        }
        continue;
      }

      // Parse component line: "component-id: version"
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        throw new BitError(`invalid line format: "${line}". Expected format: "component-id: version"`);
      }

      const componentIdStr = line.substring(0, colonIndex).trim();
      const version = line.substring(colonIndex + 1).trim();

      if (!componentIdStr || !version) {
        throw new BitError(`invalid line format: "${line}". Expected format: "component-id: version"`);
      }

      // Find the component ID in our list
      const componentId = componentsByName.get(componentIdStr);
      if (!componentId) {
        // Component not in the current tagging list - skip it
        continue;
      }

      // Extract prerelease ID if present
      let prereleaseId: string | undefined;
      if (version.includes('-')) {
        const prereleaseMatch = version.match(/-([^.]+)/);
        if (prereleaseMatch) {
          prereleaseId = prereleaseMatch[1];
        }
      }

      results.push({
        componentId,
        dependencies: [], // Will be populated by the calling code
        versionToTag: version,
        prereleaseId,
        message: undefined, // Messages handled separately via --message or --editor
        isNew: false, // Will be determined by the calling code
      });
    }

    // For components not specified in the file, use default version if provided
    if (defaultVersion) {
      const specifiedIds = new Set(results.map((r) => r.componentId.toStringWithoutVersion()));

      for (const componentId of this.componentsToTag) {
        if (!specifiedIds.has(componentId.toStringWithoutVersion())) {
          let prereleaseId: string | undefined;
          if (defaultVersion.includes('-')) {
            const prereleaseMatch = defaultVersion.match(/-([^.]+)/);
            if (prereleaseMatch) {
              prereleaseId = prereleaseMatch[1];
            }
          }

          results.push({
            componentId,
            dependencies: [],
            versionToTag: defaultVersion,
            prereleaseId,
            message: undefined,
            isNew: false,
          });
        }
      }
    }

    return results;
  }
}
