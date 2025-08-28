import { ComponentID } from '@teambit/component-id';
import { loadConsumerIfExist } from '@teambit/legacy.consumer';
import { getRemoteByName } from '@teambit/scope.remotes';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import type { Logger } from '@teambit/logger';

/**
 * Utility class for fetching and processing remote components for MCP server.
 * 
 * This class is specifically needed for consumer-project mode where there is no local 
 * workspace or scope available. It uses ConsumerComponent instances fetched from remote
 * to provide rich component information including extensions data, which enables access
 * to docs, compositions, environment details, and full dependency information.
 */
export class RemoteComponentUtils {
  constructor(private logger: Logger) {}

  async getRemoteComponentWithDetails(componentName: string): Promise<any> {
    const componentId = ComponentID.fromString(componentName);
    const consumer = await loadConsumerIfExist();
    const remote = await getRemoteByName(componentId.scope as string, consumer);

    const consumerComponent = await remote.show(componentId);

    if (!consumerComponent) {
      throw new Error(`Component ${componentName} not found in remote`);
    }

    // Build result in the same format as getCompDetails from api-for-ide.ts
    const result: any = {};

    // ID as string (to match workspace format)
    result.id = consumerComponent.id.toString();

    // Package name using componentIdToPackageName utility
    const packageName = componentIdToPackageName(consumerComponent);
    result['package name'] = packageName;

    // Files
    const mainFiles: string[] = [];
    const devFiles: any = {
      config: [], // Add config entry like workspace version
    };

    consumerComponent.files.forEach((file: any) => {
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
        const file = consumerComponent.files.find((f: any) => f.relative === filePath);
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
        const file = consumerComponent.files.find((f: any) => f.relative === filePath);
        if (file && file.contents) {
          result.usageExamples[filePath] = file.contents.toString();
        }
      });
    }

    // Extract environment from extensions
    if (consumerComponent.extensions) {
      const envsExtension = consumerComponent.extensions.findExtension('teambit.envs/envs');
      if (envsExtension && envsExtension.data && envsExtension.data.id) {
        result.env = envsExtension.data.id;
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

    // Add URL using ComponentUrl utility
    result.url = ComponentUrl.toUrl(componentId, { includeVersion: false });

    // Component location (since it's remote)
    result.componentLocation = 'a remote component';

    return result;
  }
}