import { ComponentID } from '@teambit/component-id';
import { loadConsumerIfExist } from '@teambit/legacy.consumer';
import { getRemoteByName } from '@teambit/scope.remotes';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { ExtensionDataList } from '@teambit/legacy.extension-data';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import type { Logger } from '@teambit/logger';

export class RemoteComponentUtils {
  constructor(private logger: Logger) {}

  async getRemoteComponentWithDetails(componentName: string): Promise<any> {
    try {
      this.logger.debug(`[MCP-DEBUG] Fetching remote component using remote.show(): ${componentName}`);

      const componentId = ComponentID.fromString(componentName);
      const consumer = await loadConsumerIfExist();
      const remote = await getRemoteByName(componentId.scope as string, consumer);

      // Use the same approach as bit show --legacy
      // Note: remote.show() returns ConsumerComponent (imported as Component in remote.ts)
      const consumerComponent = await remote.show(componentId);

      if (!consumerComponent) {
        throw new Error(`Component ${componentName} not found in remote`);
      }

      // Extensions are now properly populated from the raw object via ConsumerComponent.fromObject()
      this.logger.debug(`[MCP-DEBUG] ConsumerComponent has extensions: ${!!consumerComponent.extensions} (${consumerComponent.extensions?.length || 0})`);
      if (consumerComponent.extensions) {
        const extensionNames = consumerComponent.extensions.map(ext => ext.stringId).join(', ');
        this.logger.debug(`[MCP-DEBUG] Available extensions: ${extensionNames}`);
      }

      // Build result in the same format as getCompDetails from api-for-ide.ts
      const result: any = {};

      // ID as string (to match workspace format)
      result.id = consumerComponent.id.toString();

      // Package name using componentIdToPackageName utility
      try {
        const packageName = componentIdToPackageName({
          id: componentId,
          extensions: consumerComponent.extensions || new ExtensionDataList(),
          bindingPrefix: consumerComponent.bindingPrefix,
          defaultScope: componentId.scope,
        });
        result['package name'] = packageName;
      } catch (error) {
        this.logger.warn(`Failed to get package name for ${componentId.toString()}: ${(error as Error).message}`);
      }

      // Files
      if ((consumerComponent as any).files) {
        const mainFiles: string[] = [];
        const devFiles: any = {
          config: [], // Add config entry like workspace version
        };

        (consumerComponent as any).files.forEach((file: any) => {
          const relativePath = file.relative;

          // Categorize files similar to how getCompDetails does it
          if (relativePath.includes('.docs.') || relativePath.includes('.doc.') || relativePath.endsWith('.mdx')) {
            if (!devFiles['teambit.docs/docs']) devFiles['teambit.docs/docs'] = [];
            devFiles['teambit.docs/docs'].push(relativePath);
          } else if (relativePath.includes('.composition.') || relativePath.includes('.comp.')) {
            if (!devFiles['teambit.compositions/compositions']) devFiles['teambit.compositions/compositions'] = [];
            devFiles['teambit.compositions/compositions'].push(relativePath);
          } else if (relativePath.includes('.spec.') || relativePath.includes('.test.')) {
            if (!devFiles['teambit.defender/tester']) devFiles['teambit.defender/tester'] = [];
            devFiles['teambit.defender/tester'].push(relativePath);
          } else {
            mainFiles.push(relativePath);
          }
        });

        result.files = mainFiles;
        result['dev files'] = devFiles;

        // Extract docs content from files
        const docsFiles = devFiles['teambit.docs/docs'];
        if (docsFiles && docsFiles.length > 0) {
          result.docs = {};
          docsFiles.forEach((filePath: string) => {
            const file = (consumerComponent as any).files.find((f: any) => f.relative === filePath);
            if (file && file.contents) {
              result.docs[filePath] = file.contents.toString();
            }
          });
        }

        // Extract composition content
        const compositionFiles = devFiles['teambit.compositions/compositions'];
        if (compositionFiles && compositionFiles.length > 0) {
          result.usageExamples = {};
          compositionFiles.forEach((filePath: string) => {
            const file = (consumerComponent as any).files.find((f: any) => f.relative === filePath);
            if (file && file.contents) {
              result.usageExamples[filePath] = file.contents.toString();
            }
          });
        }
      }

      // Extract environment from extensions
      if (consumerComponent.extensions) {
        const envsExtension = consumerComponent.extensions.findExtension('teambit.envs/envs');
        if (envsExtension && envsExtension.data && envsExtension.data.id) {
          result.env = envsExtension.data.id;
          // Add env to dev files
          result['dev files'][envsExtension.data.id] = [];
        }
        
        // Extract dependencies from dependency resolver extension
        const depResolverExtension = consumerComponent.extensions.findExtension('teambit.dependencies/dependency-resolver');
        if (depResolverExtension && depResolverExtension.data && depResolverExtension.data.dependencies) {
          result.dependencies = depResolverExtension.data.dependencies.map((dep: any) => {
            const { packageName, id, version, lifecycle, __type: type, source } = dep;
            const pkg = packageName || id;
            const versionStr = version ? `@${version}` : '';
            const compIdStr = type === 'component' && id ? `, component-id: ${id}` : '';
            return `${pkg}${versionStr} (lifecycle: ${lifecycle || 'runtime'}, type: ${type || 'component'}, source: ${source || 'auto'}${compIdStr})`;
          });
        }
      }
      
      // Fallback to basic dependencies if extensions don't have dependency info
      if (!result.dependencies && (consumerComponent as any).dependencies?.dependencies) {
        result.dependencies = (consumerComponent as any).dependencies.dependencies.map((dep: any) => {
          const pkg = dep.getPackageName?.() || dep.id?.toString() || dep.id;
          const version = dep.version || (dep.id?.version) || '';
          const pkgWithVer = version ? `${pkg}@${version}` : pkg;
          const compIdStr = dep.id ? `, component-id: ${dep.id}` : '';
          return `${pkgWithVer} (lifecycle: ${dep.lifecycle || 'runtime'}, type: component, source: ${dep.source || 'auto'}${compIdStr})`;
        });
      }

      // Add URL using ComponentUrl utility
      result.url = ComponentUrl.toUrl(componentId, { includeVersion: false });

      // Component location (since it's remote)
      result.componentLocation = 'a remote component';

      return result;

    } catch (error) {
      this.logger.error(`[MCP-DEBUG] Failed to get remote component using remote.show(): ${(error as Error).message}`);
      throw error;
    }
  }
}