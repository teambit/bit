#!/usr/bin/env node
/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */
/* eslint-disable max-lines */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { GLOBAL_LOGS } from '@teambit/legacy.constants';
import execa from 'execa';
import fs from 'fs';
import path from 'path';

/**
 * Writes a debug message to mcp-server-debug.log in the cwd if --debug is present in process.argv.
 */
function debug(message: string) {
  if (!process.argv.includes('--debug')) return;
  const logPath = path.join(GLOBAL_LOGS, 'mcp-server-debug.log');
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logPath, line, { encoding: 'utf8' });
}

// eslint-disable-next-line complexity
export async function startMcpServer() {
  debug(
    `Starting mcp server. Process ID: ${process.pid}, CWD: ${process.cwd()}, Args: ${JSON.stringify(process.argv)}`
  );
  const server = new McpServer({
    name: 'bit-cli-mcp',
    version: '0.0.1',
  });

  let bitBin = 'bit';
  const binArgIndex = process.argv.findIndex((arg) => arg === '--bin' || arg.startsWith('--bin='));
  if (binArgIndex !== -1) {
    if (process.argv[binArgIndex].startsWith('--bin=')) {
      bitBin = process.argv[binArgIndex].split('=', 2)[1] || bitBin;
    } else if (process.argv[binArgIndex + 1]) {
      bitBin = process.argv[binArgIndex + 1];
    }
  }

  async function runBit(cwd: string, args: string[]): Promise<CallToolResult> {
    debug(`Running "${bitBin} ${args.join(' ')}" in "${cwd}"`);
    try {
      const { stdout } = await execa(bitBin, args, { cwd });
      const data = stdout.trim();
      return {
        content: [{ type: 'text', text: data }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error running ${bitBin} ${args[0]}: ${error}` }],
      };
    }
  }

  // Determine if --extended is set
  const extended = process.argv.includes('--extended');

  // List of the most useful tools to load by default
  const defaultTools = new Set([
    'bit_status',
    'bit_list',
    'bit_add',
    'bit_init',
    'bit_show',
    'bit_tag',
    'bit_snap',
    'bit_import',
    'bit_export',
    'bit_remove',
    'bit_log',
    'bit_test',
    'bit_diff',
    'bit_install',
    'bit_lane_show',
    'bit_lane_create',
    'bit_lane_switch',
    'bit_create',
    'bit_lane_merge',
    'bit_templates',
    'bit_reset',
    'bit_checkout',
  ]);

  function shouldRegisterTool(name: string) {
    return extended || defaultTools.has(name);
  }

  const cwdSchema = {
    cwd: z.string().describe('Path to workspace'),
  };

  if (shouldRegisterTool('bit_status'))
    server.tool(
      'bit_status',
      'Present the current status of components in the workspace, including indication of detected issues.',
      {
        ...cwdSchema,
        warnings: z
          .boolean()
          .optional()
          .describe('Show warnings. By default, only issues that block tag/snap are shown'),
        json: z.boolean().optional().describe('Return a JSON version of the component status'),
        verbose: z
          .boolean()
          .optional()
          .describe('Show extra data: full snap hashes for staged components, and divergence point for lanes'),
        lanes: z.boolean().optional().describe('When on a lane, show updates from main and updates from forked lanes'),
        strict: z.boolean().optional().describe('Exit with code 1 if issues are found'),
        ignoreCircularDependencies: z
          .boolean()
          .optional()
          .describe('Do not check for circular dependencies to get results quicker'),
      },
      async ({
        cwd,
        warnings,
        json,
        verbose,
        lanes,
        strict,
        ignoreCircularDependencies,
      }: {
        cwd: string;
        warnings?: boolean;
        json?: boolean;
        verbose?: boolean;
        lanes?: boolean;
        strict?: boolean;
        ignoreCircularDependencies?: boolean;
      }) => {
        const args = ['status'];
        if (warnings) args.push('--warnings');
        if (json) args.push('--json');
        if (verbose) args.push('--verbose');
        if (lanes) args.push('--lanes');
        if (strict) args.push('--strict');
        if (ignoreCircularDependencies) args.push('--ignore-circular-dependencies');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_list'))
    server.tool(
      'bit_list',
      'List components on a workspace or a remote scope. Supports filtering, formatting, and highlighting outdated or deleted components.',
      {
        ...cwdSchema,
        remoteScope: z.string().optional().describe('Remote scope to list components from'),
        ids: z.boolean().optional().describe('Show only component ids, unformatted'),
        localScope: z
          .boolean()
          .optional()
          .describe('Show only components stored in the local scope, including indirect dependencies'),
        scope: z.string().optional().describe('Filter components by their scope name (e.g., teambit.workspace)'),
        outdated: z
          .boolean()
          .optional()
          .describe('Highlight outdated components compared to their latest remote version'),
        includeDeleted: z.boolean().optional().describe('Show also deleted components (EXPERIMENTAL)'),
        json: z.boolean().optional().describe('Show the output in JSON format'),
        namespace: z
          .string()
          .optional()
          .describe("Filter components by their namespace (a logical grouping within a scope, e.g., 'ui', '*/ui')"),
      },
      async ({
        cwd,
        remoteScope,
        ids,
        localScope,
        scope,
        outdated,
        includeDeleted,
        json,
        namespace,
      }: {
        cwd: string;
        remoteScope?: string;
        ids?: boolean;
        localScope?: boolean;
        scope?: string;
        outdated?: boolean;
        includeDeleted?: boolean;
        json?: boolean;
        namespace?: string;
      }) => {
        const args = ['list'];
        if (remoteScope) args.push(remoteScope);
        if (ids) args.push('--ids');
        if (localScope) args.push('--local-scope');
        if (scope) args.push('--scope', scope);
        if (outdated) args.push('--outdated');
        if (includeDeleted) args.push('--include-deleted');
        if (json) args.push('--json');
        if (namespace) args.push('--namespace', namespace);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_add'))
    server.tool(
      'bit_add',
      'Track one or more directories as new components. Supports setting id, main file, namespace, scope, environment, and output format.',
      {
        ...cwdSchema,
        path: z.array(z.string()).describe('Paths to directories or files to add as components'),
        id: z.string().optional().describe('Manually set component id'),
        main: z.string().optional().describe('Define component entry point'),
        namespace: z.string().optional().describe('Organize component in a namespace'),
        override: z.string().optional().describe('Override existing component if exists (default = false)'),
        scope: z
          .string()
          .optional()
          .describe("Set the component's scope. If not entered, the default-scope from workspace.jsonc will be used"),
        env: z
          .string()
          .optional()
          .describe("Set the component's environment. Overrides the env from variants if exists"),
        json: z.boolean().optional().describe('Output as json format'),
      },
      async ({
        cwd,
        path,
        id,
        main,
        namespace,
        override,
        scope,
        env,
        json,
      }: {
        cwd: string;
        path: string[];
        id?: string;
        main?: string;
        namespace?: string;
        override?: string;
        scope?: string;
        env?: string;
        json?: boolean;
      }) => {
        const args = ['add', ...(path || [])];
        if (id) args.push('--id', id);
        if (main) args.push('--main', main);
        if (namespace) args.push('--namespace', namespace);
        if (override) args.push('--override', override);
        if (scope) args.push('--scope', scope);
        if (env) args.push('--env', env);
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_init'))
    server.tool(
      'bit_init',
      'Create or reinitialize an empty workspace.',
      {
        ...cwdSchema,
        path: z.string().optional().describe('Path to initialize the workspace in (default: current directory)'),
        name: z.string().optional().describe('Name of the workspace'),
        generator: z
          .string()
          .optional()
          .describe(
            "Add env-ids into the generators field in the workspace config for future 'bit create' templates (comma separated)"
          ),
        standalone: z
          .boolean()
          .optional()
          .describe(
            'Do not nest component store within .git directory and do not write config data inside package.json'
          ),
        noPackageJson: z.boolean().optional().describe('Do not generate package.json'),
        reset: z.boolean().optional().describe('Write missing or damaged Bit files'),
        resetNew: z
          .boolean()
          .optional()
          .describe('Reset .bitmap file as if the components were newly added and remove all model data (objects)'),
        resetLaneNew: z
          .boolean()
          .optional()
          .describe(
            'Same as reset-new, but only resets components belonging to lanes. Main components are left intact'
          ),
        resetHard: z
          .boolean()
          .optional()
          .describe(
            'Delete all Bit files and directories, including Bit configuration, tracking and model data. Useful for re-starting workspace from scratch'
          ),
        resetScope: z
          .boolean()
          .optional()
          .describe(
            'Removes local scope (.bit or .git/bit). Tags/snaps that have not been exported will be lost. Workspace is left intact'
          ),
        defaultDirectory: z
          .string()
          .optional()
          .describe('Set the default directory pattern to import/create components into'),
        defaultScope: z.string().optional().describe('Set the default scope for components in the workspace'),
        force: z.boolean().optional().describe('Force workspace initialization without clearing local objects'),
        bare: z.string().optional().describe('Initialize an empty bit bare scope (optionally provide a name)'),
        shared: z.string().optional().describe('Add group write permissions to a scope properly'),
      },
      async ({
        cwd,
        path,
        name,
        generator,
        standalone,
        noPackageJson,
        reset,
        resetNew,
        resetLaneNew,
        resetHard,
        resetScope,
        defaultDirectory,
        defaultScope,
        force,
        bare,
        shared,
      }) => {
        const args = ['init'];
        if (path) args.push(path);
        if (name) args.push('--name', name);
        if (generator) args.push('--generator', generator);
        if (standalone) args.push('--standalone');
        if (noPackageJson) args.push('--no-package-json');
        if (reset) args.push('--reset');
        if (resetNew) args.push('--reset-new');
        if (resetLaneNew) args.push('--reset-lane-new');
        if (resetHard) args.push('--reset-hard');
        if (resetScope) args.push('--reset-scope');
        if (defaultDirectory) args.push('--default-directory', defaultDirectory);
        if (defaultScope) args.push('--default-scope', defaultScope);
        if (force) args.push('--force');
        if (bare) args.push('--bare', bare);
        if (shared) args.push('--shared', shared);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_show'))
    server.tool(
      'bit_show',
      "Display the component's essential information.",
      {
        ...cwdSchema,
        componentName: z.string().describe('Component name or component id'),
        json: z.boolean().optional().describe('Return the component data in json format'),
        legacy: z.boolean().optional().describe('Use the legacy bit show'),
        remote: z.boolean().optional().describe('Show data for a remote component'),
        browser: z.boolean().optional().describe('Open the component page in the browser'),
        compare: z
          .boolean()
          .optional()
          .describe('Legacy-only. Compare current file system component to its latest tagged version'),
      },
      async ({ cwd, componentName, json, legacy, remote, browser, compare }) => {
        const args = ['show', componentName];
        if (json) args.push('--json');
        if (legacy) args.push('--legacy');
        if (remote) args.push('--remote');
        if (browser) args.push('--browser');
        if (compare) args.push('--compare');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_tag'))
    server.tool(
      'bit_tag',
      'Create an immutable and exportable component snapshot, tagged with a release version.',
      {
        ...cwdSchema,
        componentPatterns: z
          .array(z.string())
          .optional()
          .describe(
            'Component name, component id, or component pattern(s) to tag. By default, all new and modified are tagged.'
          ),
        message: z.string().optional().describe('A log message describing latest changes'),
        unmodified: z
          .boolean()
          .optional()
          .describe('Include unmodified components (by default, only new and modified components are tagged)'),
        editor: z
          .string()
          .optional()
          .describe(
            'Open an editor to write a tag message for each component. Optionally, specify the editor-name (defaults to vim).'
          ),
        ver: z.string().optional().describe('Tag with the given version'),
        increment: z
          .string()
          .optional()
          .describe('Increment level: major, premajor, minor, preminor, patch, prepatch, prerelease'),
        prereleaseId: z.string().optional().describe("Prerelease identifier (e.g. 'dev' to get '1.0.0-dev.1')"),
        patch: z.boolean().optional().describe("Syntactic sugar for '--increment patch'"),
        minor: z.boolean().optional().describe("Syntactic sugar for '--increment minor'"),
        major: z.boolean().optional().describe("Syntactic sugar for '--increment major'"),
        preRelease: z
          .string()
          .optional()
          .describe("Syntactic sugar for '--increment prerelease' and `--prerelease-id <identifier>`"),
        snapped: z.boolean().optional().describe('Tag only components whose head is a snap (not a tag)'),
        unmerged: z.boolean().optional().describe('Complete a merge process by tagging the unmerged components'),
        skipTests: z.boolean().optional().describe('Skip running component tests during tag process'),
        skipTasks: z.string().optional().describe('Skip the given tasks (comma separated)'),
        skipAutoTag: z.boolean().optional().describe('Skip auto tagging dependents'),
        soft: z.boolean().optional().describe('Do not persist. Only keep note of the changes to be made'),
        persist: z
          .string()
          .optional()
          .describe(
            "Persist the changes generated by --soft tag. By default, run the build pipeline, unless 'skip-build' is provided"
          ),
        disableTagPipeline: z.boolean().optional().describe('Skip the tag pipeline to avoid publishing the components'),
        ignoreBuildErrors: z.boolean().optional().describe('Proceed to tag pipeline even when build pipeline fails'),
        rebuildDepsGraph: z
          .boolean()
          .optional()
          .describe('Do not reuse the saved dependencies graph, instead build it from scratch'),
        incrementBy: z
          .string()
          .optional()
          .describe('Increment semver flag (patch/minor/major) by. E.g. incrementing patch by 2: 0.0.1 -> 0.0.3.'),
        ignoreNewestVersion: z
          .boolean()
          .optional()
          .describe('Allow tagging even when the component has newer versions e.g. for hotfixes.'),
        failFast: z.boolean().optional().describe('Stop pipeline execution on the first failed task'),
        build: z.boolean().optional().describe('Locally run the build pipeline and complete the tag'),
        detachHead: z.boolean().optional().describe('Tag without changing the head (unsupported yet)'),
      },
      async (params) => {
        const { cwd, componentPatterns, ...flags } = params;
        const args = ['tag'];
        if (componentPatterns && componentPatterns.length) args.push(...componentPatterns);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_snap'))
    server.tool(
      'bit_snap',
      'Create an immutable and exportable component snapshot (non-release version).',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. By default, only new and modified components are snapped.'
          ),
        message: z
          .string()
          .optional()
          .describe('Snap message describing the latest changes - will appear in component history log'),
        unmodified: z
          .boolean()
          .optional()
          .describe('Include unmodified components (by default, only new and modified components are snapped)'),
        unmerged: z.boolean().optional().describe('Complete a merge process by snapping the unmerged components'),
        build: z.boolean().optional().describe('Locally run the build pipeline and complete the snap'),
        editor: z
          .string()
          .optional()
          .describe(
            'Open an editor to write a snap message per component. Optionally specify the editor-name (defaults to vim).'
          ),
        skipTests: z.boolean().optional().describe('Skip running component tests during snap process'),
        skipTasks: z.string().optional().describe('Skip the given tasks (comma separated)'),
        skipAutoSnap: z.boolean().optional().describe('Skip auto snapping dependents'),
        disableSnapPipeline: z
          .boolean()
          .optional()
          .describe(
            'Skip the snap pipeline. This will for instance skip packing and publishing component version for install, and app deployment'
          ),
        ignoreBuildErrors: z.boolean().optional().describe('Proceed to snap pipeline even when build pipeline fails'),
        rebuildDepsGraph: z
          .boolean()
          .optional()
          .describe('Do not reuse the saved dependencies graph, instead build it from scratch'),
        failFast: z.boolean().optional().describe('Stop pipeline execution on the first failed task'),
        detachHead: z.boolean().optional().describe('Snap without changing the head (unsupported yet)'),
      },
      async (params) => {
        const { cwd, componentPattern, ...flags } = params;
        const args = ['snap'];
        if (componentPattern) args.push(componentPattern);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_import'))
    server.tool(
      'bit_import',
      'Import components from their remote scopes to the local workspace.',
      {
        ...cwdSchema,
        componentPatterns: z
          .array(z.string())
          .optional()
          .describe(
            'Component IDs or component patterns (separated by space). Use patterns to import groups of components.'
          ),
        path: z
          .string()
          .optional()
          .describe('Import components into a specific directory (a relative path in the workspace)'),
        objects: z
          .boolean()
          .optional()
          .describe(
            'Import components objects to the local scope without checkout (without writing them to the file system)'
          ),
        override: z.boolean().optional().describe('Override local changes'),
        verbose: z.boolean().optional().describe('Show verbose output for inspection'),
        json: z.boolean().optional().describe('Return the output as JSON'),
        skipDependencyInstallation: z
          .boolean()
          .optional()
          .describe('Do not auto-install dependencies of the imported components'),
        skipWriteConfigFiles: z
          .boolean()
          .optional()
          .describe('Do not write config files (such as eslint, tsconfig, prettier, etc...)'),
        merge: z
          .string()
          .optional()
          .describe("Merge local changes with the imported version. strategy should be 'theirs', 'ours' or 'manual'"),
        dependencies: z
          .boolean()
          .optional()
          .describe(
            'Import all dependencies (bit components only) of imported components and write them to the workspace'
          ),
        dependenciesHead: z
          .boolean()
          .optional()
          .describe('Same as --dependencies, except it imports the dependencies with their head version'),
        dependents: z
          .boolean()
          .optional()
          .describe(
            'Import components found while traversing from the imported components upwards to the workspace components'
          ),
        dependentsVia: z
          .string()
          .optional()
          .describe(
            'Same as --dependents except the traversal must go through the specified component(s) (comma separated)'
          ),
        dependentsAll: z
          .boolean()
          .optional()
          .describe(
            'Same as --dependents except not prompting for selecting paths but rather selecting all paths and showing final confirmation before importing'
          ),
        silent: z.boolean().optional().describe('No prompt for --dependents/--dependents-via flags'),
        filterEnvs: z
          .string()
          .optional()
          .describe("Only import components that have the specified environment (e.g., 'teambit.react/react-env')"),
        saveInLane: z
          .boolean()
          .optional()
          .describe(
            'When checked out to a lane and the component is not on the remote-lane, save it in the lane (defaults to save on main)'
          ),
        allHistory: z.boolean().optional().describe('Avoid optimizations, fetch all history versions, always'),
        fetchDeps: z
          .boolean()
          .optional()
          .describe('Fetch dependencies (bit components) objects to the local scope, but dont add to the workspace'),
        writeDeps: z
          .string()
          .optional()
          .describe('Write all workspace component dependencies to package.json or workspace.jsonc'),
        trackOnly: z
          .boolean()
          .optional()
          .describe('Do not write any component files, just create .bitmap entries of the imported components'),
        includeDeprecated: z
          .boolean()
          .optional()
          .describe('When importing with patterns, include deprecated components (default to exclude them)'),
      },
      async (params) => {
        const { cwd, componentPatterns, ...flags } = params;
        const args = ['import'];
        if (componentPatterns && componentPatterns.length) args.push(...componentPatterns);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_export'))
    server.tool(
      'bit_export',
      'Export components from the workspace to remote scopes.',
      {
        ...cwdSchema,
        componentPatterns: z
          .array(z.string())
          .optional()
          .describe(
            'Component name, component id, or component pattern(s) to export. Not recommended to use patterns in most scenarios.'
          ),
        eject: z
          .boolean()
          .optional()
          .describe('After export, remove the components from the workspace and install them as packages'),
        all: z.boolean().optional().describe('Export all components, including non-staged'),
        allVersions: z.boolean().optional().describe('Export not only staged versions but all of them'),
        originDirectly: z
          .boolean()
          .optional()
          .describe('Avoid export to the central hub, instead, export directly to the original scopes'),
        resume: z
          .string()
          .optional()
          .describe('In case the previous export failed and suggested to resume with an export-id, enter the id'),
        headOnly: z
          .boolean()
          .optional()
          .describe(
            'In case previous export failed and locally it shows exported and only one snap/tag was created, try using this flag'
          ),
        ignoreMissingArtifacts: z.boolean().optional().describe("Don't throw an error when artifact files are missing"),
        forkLaneNewScope: z
          .boolean()
          .optional()
          .describe('Allow exporting a forked lane into a different scope than the original scope'),
        openBrowser: z
          .boolean()
          .optional()
          .describe('Open a browser once the export is completed in the cloud job url'),
        verbose: z.boolean().optional().describe('Per exported component, show the versions being exported'),
        json: z.boolean().optional().describe('Show output in json format'),
      },
      async (params) => {
        const { cwd, componentPatterns, ...flags } = params;
        const args = ['export'];
        if (componentPatterns && componentPatterns.length) args.push(...componentPatterns);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_remove'))
    server.tool(
      'bit_remove',
      'Remove component(s) from the local workspace.',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        track: z
          .boolean()
          .optional()
          .describe('Keep tracking component in .bitmap (default = false), helps transform a tagged-component to new'),
        keepFiles: z.boolean().optional().describe('Keep component files (just untrack the component)'),
        force: z.boolean().optional().describe('Removes the component from the scope, even if used as a dependency'),
        silent: z.boolean().optional().describe('Skip confirmation'),
      },
      async ({ cwd, componentPattern, ...flags }) => {
        const args = ['remove', componentPattern];
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_test'))
    server.tool(
      'bit_test',
      'Test components in the workspace. By default only runs tests for new and modified components.',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        watch: z.boolean().optional().describe('Start the tester in watch mode.'),
        debug: z.boolean().optional().describe('Start the tester in debug mode.'),
        unmodified: z.boolean().optional().describe('Test all components, not only new and modified'),
        junit: z.string().optional().describe('Write tests results as JUnit XML format into the specified file path'),
        coverage: z.boolean().optional().describe('Show code coverage data'),
        env: z.string().optional().describe('Test only components assigned the given env'),
        updateSnapshot: z
          .boolean()
          .optional()
          .describe('If supported by the tester, re-record every snapshot that fails during the test run'),
        json: z.boolean().optional().describe('Return the results in json format'),
      },
      async (params) => {
        const { cwd, componentPattern, ...flags } = params;
        const args = ['test'];
        if (componentPattern) args.push(componentPattern);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_checkout'))
    server.tool(
      'bit_checkout',
      'Switch between component versions or remove local changes.',
      {
        ...cwdSchema,
        to: z
          .string()
          .describe(
            "Permitted values: [head, latest, reset, {specific-version}, {head~x}]. 'head' - last snap/tag. 'latest' - semver latest tag. 'reset' - removes local changes"
          ),
        componentPattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        interactiveMerge: z
          .boolean()
          .optional()
          .describe(
            'When a component is modified and the merge process found conflicts, display options to resolve them'
          ),
        autoMergeResolve: z
          .string()
          .optional()
          .describe('In case of merge conflict, resolve according to the provided strategy: [ours, theirs, manual]'),
        manual: z
          .boolean()
          .optional()
          .describe(
            'Same as --auto-merge-resolve manual. In case of merge conflict, write the files with the conflict markers'
          ),
        all: z.boolean().optional().describe('All components'),
        workspaceOnly: z
          .boolean()
          .optional()
          .describe(
            "Only relevant for 'bit checkout head' when on a lane. Don't import components from the remote lane that are not already in the workspace"
          ),
        verbose: z.boolean().optional().describe('Showing verbose output for inspection'),
        skipDependencyInstallation: z
          .boolean()
          .optional()
          .describe('Do not auto-install dependencies of the imported components'),
        forceOurs: z.boolean().optional().describe('Do not merge, preserve local files as is'),
        forceTheirs: z.boolean().optional().describe('Do not merge, just overwrite with incoming files'),
      },
      async (params) => {
        const { cwd, to, componentPattern, ...flags } = params;
        const args = ['checkout', to];
        if (componentPattern) args.push(componentPattern);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_merge'))
    server.tool(
      'bit_merge',
      'Merge changes of the remote head into local - auto-snaps all merged components.',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        autoMergeResolve: z
          .string()
          .optional()
          .describe('In case of a conflict, resolve according to the strategy: [ours, theirs, manual]'),
        manual: z
          .boolean()
          .optional()
          .describe(
            'Same as --auto-merge-resolve manual. In case of merge conflict, write the files with the conflict markers'
          ),
        abort: z.boolean().optional().describe('In case of an unresolved merge, revert to pre-merge state'),
        resolve: z
          .boolean()
          .optional()
          .describe('Mark an unresolved merge as resolved and create a new snap with the changes'),
        noSnap: z.boolean().optional().describe('Do not auto snap even if the merge completed without conflicts'),
        build: z
          .boolean()
          .optional()
          .describe('In case of snap during the merge, run the build-pipeline (similar to bit snap --build)'),
        verbose: z.boolean().optional().describe('Show details of components that were not merged successfully'),
        skipDependencyInstallation: z
          .boolean()
          .optional()
          .describe('Do not install new dependencies resulting from the merge'),
        message: z.string().optional().describe('Override the default message for the auto snap'),
      },
      async (params) => {
        const { cwd, componentPattern, ...flags } = params;
        const args = ['merge'];
        if (componentPattern) args.push(componentPattern);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_build'))
    server.tool(
      'bit_build',
      'Run set of tasks for build. By default, only new and modified components are built.',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        unmodified: z
          .boolean()
          .optional()
          .describe('Include unmodified components (by default, only new and modified components are built)'),
        dev: z.boolean().optional().describe('Run the pipeline in dev mode'),
        install: z.boolean().optional().describe('Install core aspects in capsules'),
        reuseCapsules: z
          .boolean()
          .optional()
          .describe('Avoid deleting the capsules root-dir before starting the build'),
        rewrite: z.boolean().optional().describe('Use only with --reuse-capsules. Rewrite the component files'),
        reinstall: z.boolean().optional().describe('Use only with --reuse-capsules. Rerun the installation'),
        tasks: z.string().optional().describe('Build the specified task(s) only (comma separated)'),
        cachePackagesOnCapsuleRoot: z
          .boolean()
          .optional()
          .describe('Set the package-manager cache on the capsule root'),
        listTasks: z
          .string()
          .optional()
          .describe('List tasks of an env or a component-id for each one of the pipelines: build, tag and snap'),
        skipTests: z.boolean().optional().describe('Skip running component tests during build process'),
        skipTasks: z.string().optional().describe('Skip the given tasks (comma separated)'),
        failFast: z.boolean().optional().describe('Stop pipeline execution on the first failed task'),
        includeSnap: z
          .boolean()
          .optional()
          .describe('Include snap pipeline tasks. Warning: this may deploy/publish if you have such tasks'),
        includeTag: z
          .boolean()
          .optional()
          .describe('Include tag pipeline tasks. Warning: this may deploy/publish if you have such tasks'),
        ignoreIssues: z.string().optional().describe("Ignore component issues (comma separated or '*' for all)"),
        json: z.boolean().optional().describe('Return the build results in json format'),
      },
      async (params) => {
        const { cwd, componentPattern, ...flags } = params;
        const args = ['build'];
        if (componentPattern) args.push(componentPattern);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lint'))
    server.tool(
      'bit_lint',
      'Lint components in the development workspace.',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        changed: z.boolean().optional().describe('Lint only new and modified components'),
        fix: z.boolean().optional().describe('Automatically fix problems'),
        fixType: z.string().optional().describe('Specify the types of fixes to apply (problem, suggestion, layout)'),
        json: z.boolean().optional().describe('Return the lint results in json format'),
      },
      async (params) => {
        const { cwd, componentPattern, ...flags } = params;
        const args = ['lint'];
        if (componentPattern) args.push(componentPattern);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_format'))
    server.tool(
      'bit_format',
      'Format components in the development workspace.',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        changed: z.boolean().optional().describe('Format only new and modified components'),
        check: z
          .boolean()
          .optional()
          .describe('Output a human-friendly message and a list of unformatted files, if any'),
        json: z.boolean().optional().describe('Return the format results in json format'),
      },
      async (params) => {
        const { cwd, componentPattern, ...flags } = params;
        const args = ['format'];
        if (componentPattern) args.push(componentPattern);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_diff'))
    server.tool(
      'bit_diff',
      "Show the diff between the components' current source files and config, and their latest snapshot or tag.",
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        version: z
          .string()
          .optional()
          .describe(
            "The base version to compare from. If omitted, compares the workspace's current files to the component's latest version."
          ),
        toVersion: z
          .string()
          .optional()
          .describe(
            "The target version to compare against 'version'. If both 'version' and 'to-version' are provided, compare those two versions directly."
          ),
        parent: z
          .boolean()
          .optional()
          .describe("Compare the specified 'version' to its immediate parent instead of comparing to the current one"),
        verbose: z.boolean().optional().describe('Show a more verbose output where possible'),
        table: z.boolean().optional().describe('Show tables instead of plain text for dependencies diff'),
      },
      async (params) => {
        const { cwd, componentPattern, version, toVersion, ...flags } = params;
        const args = ['diff'];
        if (componentPattern) args.push(componentPattern);
        if (version) args.push(version);
        if (toVersion) args.push(toVersion);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_log'))
    server.tool(
      'bit_log',
      'Show components(s) version history.',
      {
        ...cwdSchema,
        id: z.string().describe('Component-id or component-name'),
        remote: z.boolean().optional().describe('Show log of a remote component'),
        parents: z.boolean().optional().describe('Show parents and lanes data'),
        oneLine: z.boolean().optional().describe('Show each log entry in one line'),
        fullHash: z
          .boolean()
          .optional()
          .describe('Show full hash of the snap (default to the first 9 characters for --one-line/--parents flags)'),
        fullMessage: z
          .boolean()
          .optional()
          .describe('Show full message of the snap (default to the first line for --one-line/--parents flags)'),
        showHidden: z
          .boolean()
          .optional()
          .describe(
            'Show hidden snaps (snaps are marked as hidden typically when the following tag has the same files/config)'
          ),
        json: z.boolean().optional().describe('Json format'),
      },
      async ({ cwd, id, ...flags }) => {
        const args = ['log', id];
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_remove_component'))
    server.tool(
      'bit_remove_component',
      'Remove component(s) from the local workspace.',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        track: z
          .boolean()
          .optional()
          .describe('Keep tracking component in .bitmap (default = false), helps transform a tagged-component to new'),
        keepFiles: z.boolean().optional().describe('Keep component files (just untrack the component)'),
        force: z.boolean().optional().describe('Removes the component from the scope, even if used as a dependency'),
        silent: z.boolean().optional().describe('Skip confirmation'),
      },
      async ({ cwd, componentPattern, ...flags }) => {
        const args = ['remove', componentPattern];
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_watch'))
    server.tool(
      'bit_watch',
      'Automatically recompile modified components (on save).',
      {
        ...cwdSchema,
        verbose: z.boolean().optional().describe('Show all watch events and compiler verbose output'),
        skipPreCompilation: z.boolean().optional().describe('Skip compilation step before starting to watch'),
        checkTypes: z.string().optional().describe('Show errors/warnings for types. Options are [file, project]'),
        import: z
          .boolean()
          .optional()
          .describe('Import component objects if .bitmap changed not by bit (DEPRECATED, now default)'),
        skipImport: z.boolean().optional().describe('Do not import component objects if .bitmap changed not by bit'),
        generateTypes: z
          .boolean()
          .optional()
          .describe('EXPERIMENTAL. Generate d.ts files for typescript components (hurts performance)'),
        trigger: z
          .string()
          .optional()
          .describe('Trigger recompilation of the specified component regardless of what changed'),
      },
      async (params) => {
        const { cwd, ...flags } = params;
        const args = ['watch'];
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_envs'))
    server.tool(
      'bit_envs',
      'List all components maintained by the workspace and their corresponding envs.',
      {
        ...cwdSchema,
      },
      async ({ cwd }) => {
        const args = ['envs'];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_envs_list'))
    server.tool(
      'bit_envs_list',
      'List all envs currently used in the workspace.',
      {
        ...cwdSchema,
      },
      async ({ cwd }) => {
        const args = ['envs', 'list'];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_envs_get'))
    server.tool(
      'bit_envs_get',
      "Show config information from a component's env.",
      {
        ...cwdSchema,
        componentName: z
          .string()
          .describe("The 'component name' or 'component id' of the component whose env you'd like to inspect"),
        services: z
          .string()
          .optional()
          .describe(
            'Show information about the specific services only. For multiple services, separate by a comma and wrap with quotes'
          ),
      },
      async ({ cwd, componentName, services }) => {
        const args = ['envs', 'get', componentName];
        if (services) args.push('--services', services);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_envs_list_core'))
    server.tool(
      'bit_envs_list_core',
      'List all core aspects.',
      {
        ...cwdSchema,
        json: z.boolean().optional().describe('Format as json'),
      },
      async ({ cwd, json }) => {
        const args = ['envs', 'list-core'];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_envs_set'))
    server.tool(
      'bit_envs_set',
      'Set envs for components.',
      {
        ...cwdSchema,
        pattern: z
          .string()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        envId: z.string().describe("The env's component id"),
        config: z
          .string()
          .optional()
          .describe('The env config. Enter the config as a stringified JSON (e.g. \'{"foo":"bar"}\')'),
      },
      async ({ cwd, pattern, envId, config }) => {
        const args = ['envs', 'set', pattern, envId];
        if (config) args.push(config);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_envs_unset'))
    server.tool(
      'bit_envs_unset',
      'Unset env from component(s).',
      {
        ...cwdSchema,
        pattern: z
          .string()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        envId: z.string().describe("The env's component id"),
      },
      async ({ cwd, pattern, envId }) => {
        const args = ['envs', 'unset', pattern, envId];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_envs_update'))
    server.tool(
      'bit_envs_update',
      'Update a version of an env for all or specified components.',
      {
        ...cwdSchema,
        envId: z
          .string()
          .describe(
            "The env's component id. Optionally, add a version (id@version), otherwise will use the latest version from the remote"
          ),
        pattern: z
          .string()
          .optional()
          .describe(
            'The components to update (defaults to all components). Component name, component id, or component pattern.'
          ),
      },
      async ({ cwd, envId, pattern }) => {
        const args = ['envs', 'update', envId];
        if (pattern) args.push(pattern);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_config_set'))
    server.tool(
      'bit_config_set',
      'Set a configuration. Defaults to save it globally.',
      {
        ...cwdSchema,
        key: z.string().describe('Configuration key to set'),
        val: z.string().describe('Value to set for the key'),
        local: z.boolean().optional().describe('Set the configuration in the current scope (saved in .bit/scope.json)'),
        localTrack: z
          .boolean()
          .optional()
          .describe('Set the configuration in the current workspace (saved in workspace.jsonc)'),
      },
      async ({ cwd, key, val, local, localTrack }) => {
        const args = ['config', 'set', key, val];
        if (local) args.push('--local');
        if (localTrack) args.push('--local-track');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_config_del'))
    server.tool(
      'bit_config_del',
      'Delete given key from global configuration.',
      {
        ...cwdSchema,
        key: z.string().describe('Configuration key to delete'),
        origin: z.string().optional().describe('Specify to delete specifically from: [scope, workspace, global]'),
      },
      async ({ cwd, key, origin }) => {
        const args = ['config', 'del', key];
        if (origin) args.push('--origin', origin);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_config_get'))
    server.tool(
      'bit_config_get',
      'Get a value from global configuration.',
      {
        ...cwdSchema,
        key: z.string().describe('Configuration key to get'),
      },
      async ({ cwd, key }) => {
        const args = ['config', 'get', key];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_config_list'))
    server.tool(
      'bit_config_list',
      'List all configuration(s).',
      {
        ...cwdSchema,
        origin: z.string().optional().describe('List configuration specifically from: [scope, workspace, global]'),
        detailed: z.boolean().optional().describe('List all configuration(s) with the origin'),
        json: z.boolean().optional().describe('Output as JSON'),
      },
      async ({ cwd, origin, detailed, json }) => {
        const args = ['config', 'list'];
        if (origin) args.push('--origin', origin);
        if (detailed) args.push('--detailed');
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_capsule_list'))
    server.tool(
      'bit_capsule_list',
      'List the capsules generated for this workspace.',
      {
        ...cwdSchema,
        json: z.boolean().optional().describe('Json format'),
      },
      async ({ cwd, json }) => {
        const args = ['capsule', 'list'];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_capsule_create'))
    server.tool(
      'bit_capsule_create',
      'Create capsules for components.',
      {
        ...cwdSchema,
        componentIds: z.array(z.string()).optional().describe('Component ids to create capsules for'),
        baseDir: z.string().optional().describe('Set base dir of all capsules'),
        rootBaseDir: z.string().optional().describe('Set root base dir of all capsules'),
        alwaysNew: z.boolean().optional().describe('Create new environment for capsule'),
        seedersOnly: z.boolean().optional().describe('Create capsules for the seeders only (not for the entire graph)'),
        id: z.string().optional().describe('Reuse capsule of certain name'),
        useHash: z
          .boolean()
          .optional()
          .describe('Whether to use hash function (of base dir) as capsules root dir name'),
        json: z.boolean().optional().describe('Json format'),
        installPackages: z.boolean().optional().describe('Install packages by the package-manager'),
        packageManager: z.string().optional().describe('npm, yarn or pnpm, default to npm'),
      },
      async ({
        cwd,
        componentIds,
        baseDir,
        rootBaseDir,
        alwaysNew,
        seedersOnly,
        id,
        useHash,
        json,
        installPackages,
        packageManager,
      }) => {
        const args = ['capsule', 'create'];
        if (componentIds && componentIds.length) args.push(...componentIds);
        if (baseDir) args.push('--base-dir', baseDir);
        if (rootBaseDir) args.push('--root-base-dir', rootBaseDir);
        if (alwaysNew) args.push('--always-new');
        if (seedersOnly) args.push('--seeders-only');
        if (id) args.push('--id', id);
        if (useHash) args.push('--use-hash');
        if (json) args.push('--json');
        if (installPackages) args.push('--install-packages');
        if (packageManager) args.push('--package-manager', packageManager);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_capsule_delete'))
    server.tool(
      'bit_capsule_delete',
      "Delete capsules. With no args, only workspace's capsules are deleted.",
      {
        ...cwdSchema,
        scopeAspects: z.boolean().optional().describe('Delete scope-aspects capsules'),
        all: z.boolean().optional().describe('Delete all capsules for all workspaces and scopes'),
      },
      async ({ cwd, scopeAspects, all }) => {
        const args = ['capsule', 'delete'];
        if (scopeAspects) args.push('--scope-aspects');
        if (all) args.push('--all');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_remote_add'))
    server.tool(
      'bit_remote_add',
      'Add a bare-scope as a remote.',
      {
        ...cwdSchema,
        url: z.string().describe('Remote URL to add'),
        global: z.boolean().optional().describe('Configure a remote bit scope globally'),
      },
      async ({ cwd, url, global }) => {
        const args = ['remote', 'add', url];
        if (global) args.push('--global');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_remote_del'))
    server.tool(
      'bit_remote_del',
      'Remove a tracked bit remote.',
      {
        ...cwdSchema,
        name: z.string().describe('Remote name to delete'),
        global: z.boolean().optional().describe('Remove a globally configured remote scope'),
      },
      async ({ cwd, name, global }) => {
        const args = ['remote', 'del', name];
        if (global) args.push('--global');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_help'))
    server.tool(
      'bit_help',
      'Shows help.',
      {
        ...cwdSchema,
        internal: z.boolean().optional().describe('Show internal commands'),
      },
      async ({ cwd, internal }) => {
        const args = ['help'];
        if (internal) args.push('--internal');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_version'))
    server.tool(
      'bit_version',
      'Shows bit version.',
      {
        ...cwdSchema,
        json: z.boolean().optional().describe('Return the version in json format'),
      },
      async ({ cwd, json }) => {
        const args = ['version'];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_whoami'))
    server.tool(
      'bit_whoami',
      'Display the currently logged in user.',
      {
        ...cwdSchema,
      },
      async ({ cwd }) => {
        const args = ['whoami'];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_logout'))
    server.tool(
      'bit_logout',
      'Log the CLI out of Bit.',
      {
        ...cwdSchema,
      },
      async ({ cwd }) => {
        const args = ['logout'];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_init_bare'))
    server.tool(
      'bit_init_bare',
      'Create or reinitialize an empty bit bare scope.',
      {
        ...cwdSchema,
        bare: z.string().optional().describe('Initialize an empty bit bare scope (optionally provide a name)'),
      },
      async ({ cwd, bare }) => {
        const args = ['init'];
        if (bare) args.push('--bare', bare);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_new'))
    server.tool(
      'bit_new',
      'Create a new workspace from a template.',
      {
        ...cwdSchema,
        templateName: z.string().describe('The name of the workspace template'),
        workspaceName: z
          .string()
          .describe('The name for the new workspace and workspace directory that will be created'),
        aspect: z.string().optional().describe('ID of the aspect that registered the template'),
        template: z.string().optional().describe('ID of the dev environment to use for the template. Alias for --env.'),
        env: z.string().optional().describe('ID of the dev environment to use for the template. Alias -t'),
        defaultScope: z
          .string()
          .optional()
          .describe('Set the default scope for the workspace. Used in the generated workspace.jsonc'),
        skipGit: z.boolean().optional().describe('Skip generation of Git repository in the new workspace'),
        empty: z
          .boolean()
          .optional()
          .describe(
            "Skip template's default component creation (relevant for templates that add components by default)"
          ),
        loadFrom: z.string().optional().describe('Local path to the workspace containing the template'),
        currentDir: z
          .boolean()
          .optional()
          .describe(
            'Create the new workspace in current directory (default is to create a new directory, inside the current dir)'
          ),
      },
      async ({
        cwd,
        templateName,
        workspaceName,
        aspect,
        template,
        env,
        defaultScope,
        skipGit,
        empty,
        loadFrom,
        currentDir,
      }) => {
        const args = ['new', templateName, workspaceName];
        if (aspect) args.push('--aspect', aspect);
        if (template) args.push('--template', template);
        if (env) args.push('--env', env);
        if (defaultScope) args.push('--default-scope', defaultScope);
        if (skipGit) args.push('--skip-git');
        if (empty) args.push('--empty');
        if (loadFrom) args.push('--load-from', loadFrom);
        if (currentDir) args.push('--current-dir');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deprecate'))
    server.tool(
      'bit_deprecate',
      'Deprecate a component.',
      {
        ...cwdSchema,
        componentName: z.string().describe('Component name or component id'),
        newId: z.string().optional().describe('If replaced by another component, enter the new component id'),
        range: z.string().optional().describe('Enter a Semver range to deprecate specific versions'),
      },
      async ({ cwd, componentName, newId, range }) => {
        const args = ['deprecate', componentName];
        if (newId) args.push('--new-id', newId);
        if (range) args.push('--range', range);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_undeprecate'))
    server.tool(
      'bit_undeprecate',
      'Undeprecate a deprecated component (local/remote).',
      {
        ...cwdSchema,
        id: z.string().describe('Component id'),
      },
      async ({ cwd, id }) => {
        const args = ['undeprecate', id];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_move'))
    server.tool(
      'bit_move',
      'Move a component to a different filesystem path.',
      {
        ...cwdSchema,
        currentComponentDir: z.string().describe("The component's current directory (relative to the workspace root)"),
        newComponentDir: z
          .string()
          .describe("The new directory (relative to the workspace root) to create and move the component's files to"),
      },
      async ({ cwd, currentComponentDir, newComponentDir }) => {
        const args = ['move', currentComponentDir, newComponentDir];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_link'))
    server.tool(
      'bit_link',
      'Create links in the node_modules directory, to core aspects and to components in the workspace.',
      {
        ...cwdSchema,
        componentNames: z.array(z.string()).optional().describe('Names or IDs of the components to link'),
        json: z.boolean().optional().describe('Return the output as JSON'),
        verbose: z.boolean().optional().describe('Verbose output'),
        rewire: z.boolean().optional().describe('Replace relative paths with module paths in code'),
        target: z
          .string()
          .optional()
          .describe('Link to an external directory (similar to npm-link) so other projects could use these components'),
        skipFetchingObjects: z.boolean().optional().describe('Skip fetch missing objects from remotes before linking'),
        peers: z.boolean().optional().describe('Link peer dependencies of the components too'),
      },
      async ({ cwd, componentNames, json, verbose, rewire, target, skipFetchingObjects, peers }) => {
        const args = ['link'];
        if (componentNames && componentNames.length) args.push(...componentNames);
        if (json) args.push('--json');
        if (verbose) args.push('--verbose');
        if (rewire) args.push('--rewire');
        if (target) args.push('--target', target);
        if (skipFetchingObjects) args.push('--skip-fetching-objects');
        if (peers) args.push('--peers');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lanes'))
    server.tool(
      'bit_lanes',
      "Manage lanes - if no sub-command is used, runs 'bit lane list'.",
      {
        ...cwdSchema,
        details: z.boolean().optional().describe('Show more details on the state of each component in each lane'),
        json: z.boolean().optional().describe('Show lanes details in json format'),
        remote: z.string().optional().describe('Show all remote lanes from the specified scope'),
        merged: z.boolean().optional().describe('List only merged lanes'),
        notMerged: z.boolean().optional().describe("List only lanes that haven't been merged"),
      },
      async ({ cwd, details, json, remote, merged, notMerged }) => {
        const args = ['lane', 'list'];
        if (details) args.push('--details');
        if (json) args.push('--json');
        if (remote) args.push('--remote', remote);
        if (merged) args.push('--merged');
        if (notMerged) args.push('--not-merged');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_show'))
    server.tool(
      'bit_lane_show',
      'Show lane details. If no lane specified, show the current lane.',
      {
        ...cwdSchema,
        laneName: z.string().optional().describe('Lane name to show details for'),
        json: z.boolean().optional().describe('Show the lane details in json format'),
        remote: z.boolean().optional().describe('Show details of the remote head of the provided lane'),
      },
      async ({ cwd, laneName, json, remote }) => {
        const args = ['lane', 'show'];
        if (laneName) args.push(laneName);
        if (json) args.push('--json');
        if (remote) args.push('--remote');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_create'))
    server.tool(
      'bit_lane_create',
      'Creates a new lane and switches to it.',
      {
        ...cwdSchema,
        laneName: z.string().describe('The name for the new lane'),
        scope: z.string().optional().describe('Remote scope to which this lane will be exported'),
        alias: z.string().optional().describe('A local alias to refer to this lane'),
        forkLaneNewScope: z
          .boolean()
          .optional()
          .describe('Create the new lane in a different scope than its parent lane'),
      },
      async ({ cwd, laneName, scope, alias, forkLaneNewScope }) => {
        const args = ['lane', 'create', laneName];
        if (scope) args.push('--scope', scope);
        if (alias) args.push('--alias', alias);
        if (forkLaneNewScope) args.push('--fork-lane-new-scope');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_remove'))
    server.tool(
      'bit_lane_remove',
      'Remove or delete lanes.',
      {
        ...cwdSchema,
        lanes: z.array(z.string()).describe('A list of lane names, separated by spaces'),
        remote: z.boolean().optional().describe('Delete a remote lane. use remote/lane-id syntax'),
        force: z.boolean().optional().describe('Removes/deletes the lane even when the lane is not yet merged to main'),
        silent: z.boolean().optional().describe('Skip confirmation'),
      },
      async ({ cwd, lanes, remote, force, silent }) => {
        const args = ['lane', 'remove', ...lanes];
        if (remote) args.push('--remote');
        if (force) args.push('--force');
        if (silent) args.push('--silent');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_rename'))
    server.tool(
      'bit_lane_rename',
      'Change the lane-name locally.',
      {
        ...cwdSchema,
        newName: z.string().describe('The new lane name'),
        laneName: z
          .string()
          .optional()
          .describe('The name of the lane to rename. if not specified, the current lane is used'),
      },
      async ({ cwd, newName, laneName }) => {
        const args = ['lane', 'rename', newName];
        if (laneName) args.push('--lane-name', laneName);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_alias'))
    server.tool(
      'bit_lane_alias',
      'Adds an alias to a lane.',
      {
        ...cwdSchema,
        laneName: z.string().describe('The lane to alias'),
        alias: z.string().describe('The alias to add'),
      },
      async ({ cwd, laneName, alias }) => {
        const args = ['lane', 'alias', laneName, alias];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_diff'))
    server.tool(
      'bit_lane_diff',
      'Show diff between lanes.',
      {
        ...cwdSchema,
        from: z.string().optional().describe('Base lane for comparison'),
        to: z.string().optional().describe('Lane being compared to base lane'),
        pattern: z
          .string()
          .optional()
          .describe('Show lane-diff for components conforming to the specified component-pattern only'),
      },
      async ({ cwd, from, to, pattern }) => {
        const args = ['lane', 'diff'];
        if (from) args.push(from);
        if (to) args.push(to);
        if (pattern) args.push('--pattern', pattern);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_switch'))
    server.tool(
      'bit_lane_switch',
      'Switch to the specified lane.',
      {
        ...cwdSchema,
        lane: z.string().describe('Lane-name or lane-id (if lane is not local) to switch to'),
        head: z
          .boolean()
          .optional()
          .describe('Switch to the head of the lane/main (fetches the latest changes from the remote)'),
        autoMergeResolve: z
          .string()
          .optional()
          .describe(
            "Merge local changes with the checked out version. strategy should be 'theirs', 'ours' or 'manual'"
          ),
        forceOurs: z.boolean().optional().describe('Do not merge, preserve local files as is'),
        forceTheirs: z.boolean().optional().describe('Do not merge, just overwrite with incoming files'),
        workspaceOnly: z
          .boolean()
          .optional()
          .describe('Checkout only the components in the workspace to the selected lane'),
        skipDependencyInstallation: z
          .boolean()
          .optional()
          .describe('Do not install dependencies of the imported components'),
        pattern: z
          .string()
          .optional()
          .describe(
            'Switch only the lane components matching the specified component-pattern. only works when the workspace is empty'
          ),
        alias: z
          .string()
          .optional()
          .describe('Relevant when the specified lane is a remote lane. create a local alias for the lane'),
        verbose: z
          .boolean()
          .optional()
          .describe('Display detailed information about components that legitimately were not switched'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({
        cwd,
        lane,
        head,
        autoMergeResolve,
        forceOurs,
        forceTheirs,
        workspaceOnly,
        skipDependencyInstallation,
        pattern,
        alias,
        verbose,
        json,
      }) => {
        const args = ['lane', 'switch', lane];
        if (head) args.push('--head');
        if (autoMergeResolve) args.push('--auto-merge-resolve', autoMergeResolve);
        if (forceOurs) args.push('--force-ours');
        if (forceTheirs) args.push('--force-theirs');
        if (workspaceOnly) args.push('--workspace-only');
        if (skipDependencyInstallation) args.push('--skip-dependency-installation');
        if (pattern) args.push('--pattern', pattern);
        if (alias) args.push('--alias', alias);
        if (verbose) args.push('--verbose');
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_fetch'))
    server.tool(
      'bit_fetch',
      'Fetch remote objects and store locally.',
      {
        ...cwdSchema,
        ids: z.array(z.string()).optional().describe('Component ids or lane ids to fetch'),
        lanes: z.boolean().optional().describe('Fetch component objects from lanes'),
        components: z.boolean().optional().describe('Fetch components'),
        allHistory: z
          .boolean()
          .optional()
          .describe('For each component, fetch all its versions. By default, only the latest version is fetched'),
        json: z.boolean().optional().describe('Return the output as JSON'),
        fromOriginalScopes: z
          .boolean()
          .optional()
          .describe('Fetch indirect dependencies from their original scope as opposed to from their dependents'),
      },
      async ({ cwd, ids, lanes, components, allHistory, json, fromOriginalScopes }) => {
        const args = ['fetch'];
        if (ids && ids.length) args.push(...ids);
        if (lanes) args.push('--lanes');
        if (components) args.push('--components');
        if (allHistory) args.push('--all-history');
        if (json) args.push('--json');
        if (fromOriginalScopes) args.push('--from-original-scopes');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_install'))
    server.tool(
      'bit_install',
      'Installs workspace dependencies.',
      {
        ...cwdSchema,
        packages: z.array(z.string()).optional().describe('A list of packages to install (separated by spaces)'),
        type: z.string().optional().describe("'runtime' (default) or 'peer' (dev is not a valid option)"),
        update: z
          .boolean()
          .optional()
          .describe('Update all dependencies to latest version according to their semver range'),
        savePrefix: z.string().optional().describe('Set the prefix to use when adding dependency to workspace.jsonc'),
        skipDedupe: z.boolean().optional().describe('Do not dedupe dependencies on installation'),
        skipImport: z.boolean().optional().describe('Do not import bit objects post installation'),
        skipCompile: z.boolean().optional().describe('Do not compile components'),
        skipWriteConfigFiles: z
          .boolean()
          .optional()
          .describe('Do not write config files (such as eslint, tsconfig, prettier, etc...)'),
        addMissingDeps: z.boolean().optional().describe('Install all missing dependencies'),
        skipUnavailable: z
          .boolean()
          .optional()
          .describe('When adding missing dependencies, skip those that are not found in the registry'),
        addMissingPeers: z.boolean().optional().describe('Install all missing peer dependencies'),
        recurringInstall: z
          .boolean()
          .optional()
          .describe('Automatically run install again if there are non loaded old envs in your workspace'),
        noOptional: z.boolean().optional().describe('Do not install optional dependencies (works with pnpm only)'),
        lockfileOnly: z
          .boolean()
          .optional()
          .describe('Dependencies are not written to node_modules. Only the lockfile is updated'),
      },
      async (params) => {
        const { cwd, packages, ...flags } = params;
        const args = ['install'];
        if (packages && packages.length) args.push(...packages);
        for (const [key, value] of Object.entries(flags)) {
          if (typeof value === 'boolean' && value)
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`);
          else if (typeof value === 'string')
            args.push(`--${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, value);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_uninstall'))
    server.tool(
      'bit_uninstall',
      'Uninstall dependencies.',
      {
        ...cwdSchema,
        packages: z.array(z.string()).optional().describe('A list of packages to uninstall (separated by spaces)'),
      },
      async ({ cwd, packages }) => {
        const args = ['uninstall'];
        if (packages && packages.length) args.push(...packages);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_update'))
    server.tool(
      'bit_update',
      'Update dependencies. By default, dependencies are updated to the highest semver compatible versions.',
      {
        ...cwdSchema,
        packagePatterns: z
          .array(z.string())
          .optional()
          .describe('A string list of package names, or patterns (separated by spaces or commas)'),
        yes: z
          .boolean()
          .optional()
          .describe(
            'Automatically update all outdated versions for packages specified in pattern (all if no pattern supplied)'
          ),
        patch: z.boolean().optional().describe('Update to the latest patch version. Semver rules are ignored'),
        minor: z.boolean().optional().describe('Update to the latest minor version. Semver rules are ignored'),
        major: z.boolean().optional().describe('Update to the latest major version. Semver rules are ignored'),
        semver: z.boolean().optional().describe('Update to the newest version respecting semver'),
      },
      async ({ cwd, packagePatterns, yes, patch, minor, major, semver }) => {
        const args = ['update'];
        if (packagePatterns && packagePatterns.length) args.push(...packagePatterns);
        if (yes) args.push('--yes');
        if (patch) args.push('--patch');
        if (minor) args.push('--minor');
        if (major) args.push('--major');
        if (semver) args.push('--semver');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_recover'))
    server.tool(
      'bit_recover',
      'Recover component(s) soft-deleted from the workspace, or a remote scope.',
      {
        ...cwdSchema,
        componentName: z.string().describe('Component name or component id'),
        skipDependencyInstallation: z
          .boolean()
          .optional()
          .describe('Do not install packages in case of importing components'),
        skipWriteConfigFiles: z
          .boolean()
          .optional()
          .describe('Do not write config files (such as eslint, tsconfig, prettier, etc...)'),
      },
      async ({ cwd, componentName, skipDependencyInstallation, skipWriteConfigFiles }) => {
        const args = ['recover', componentName];
        if (skipDependencyInstallation) args.push('--skip-dependency-installation');
        if (skipWriteConfigFiles) args.push('--skip-write-config-files');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_clear_cache'))
    server.tool(
      'bit_clear_cache',
      "Clears Bit's cache from current working machine.",
      {
        ...cwdSchema,
        remote: z.string().optional().describe('Clear memory cache from a remote scope'),
      },
      async ({ cwd, remote }) => {
        const args = ['clear-cache'];
        if (remote) args.push('--remote', remote);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_create'))
    server.tool(
      'bit_create',
      'Create a new component (source files and config) using a template.',
      {
        ...cwdSchema,
        templateName: z
          .string()
          .describe(
            "The template for generating the component (run 'bit templates' for a list of available templates)"
          ),
        componentNames: z.array(z.string()).describe('A list of component names to generate'),
        namespace: z.string().optional().describe("Sets the component's namespace and nested dirs inside the scope"),
        scope: z
          .string()
          .optional()
          .describe("Sets the component's scope-name. if not entered, the default-scope will be used"),
        aspect: z
          .string()
          .optional()
          .describe('Aspect-id of the template. helpful when multiple aspects use the same template name'),
        template: z.string().optional().describe('Env-id of the template. alias for --aspect.'),
        path: z
          .string()
          .optional()
          .describe('Relative path in the workspace. by default the path is <scope>/<namespace>/<name>'),
        env: z
          .string()
          .optional()
          .describe("Set the component's environment. (overrides the env from variants and the template)"),
        force: z.boolean().optional().describe('Replace existing files at the target location'),
      },
      async ({ cwd, templateName, componentNames, namespace, scope, aspect, template, path, env, force }) => {
        const args = ['create', templateName, ...componentNames];
        if (namespace) args.push('--namespace', namespace);
        if (scope) args.push('--scope', scope);
        if (aspect) args.push('--aspect', aspect);
        if (template) args.push('--template', template);
        if (path) args.push('--path', path);
        if (env) args.push('--env', env);
        if (force) args.push('--force');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_merge'))
    server.tool(
      'bit_lane_merge',
      'Merge a local or a remote lane to the current lane.',
      {
        ...cwdSchema,
        lane: z.string().describe('Lane-name or full lane-id (if remote) to merge to the current lane'),
        pattern: z
          .string()
          .optional()
          .describe('Partially merge the lane - only components that match the specified component-pattern'),
        manual: z
          .boolean()
          .optional()
          .describe(
            'Same as --auto-merge-resolve manual. In case of merge conflict, write the files with the conflict markers'
          ),
        autoMergeResolve: z
          .string()
          .optional()
          .describe('In case of a merge conflict, resolve according to the strategy: [ours, theirs, manual]'),
        ours: z
          .boolean()
          .optional()
          .describe('DEPRECATED. use --auto-merge-resolve. in case of a conflict, keep local modifications'),
        theirs: z
          .boolean()
          .optional()
          .describe(
            'DEPRECATED. use --auto-merge-resolve. in case of a conflict, override the local modification with the specified version'
          ),
        workspace: z.boolean().optional().describe('Merge only lane components that are in the current workspace'),
        noAutoSnap: z
          .boolean()
          .optional()
          .describe(
            'Do not auto snap after merge completed without conflicts of diverged components (see command description)'
          ),
        noSnap: z
          .boolean()
          .optional()
          .describe('Do not pass snaps from the other lane even for non-diverged components (see command description)'),
        tag: z
          .boolean()
          .optional()
          .describe('Auto-tag all lane components after merging into main (or tag-merge in case of snap-merge)'),
        build: z
          .boolean()
          .optional()
          .describe('In case of snap during the merge, run the build-pipeline (similar to bit snap --build)'),
        message: z.string().optional().describe('Override the default message for the auto snap'),
        keepReadme: z.boolean().optional().describe('Skip deleting the lane readme component after merging'),
        noSquash: z
          .boolean()
          .optional()
          .describe('Relevant for merging lanes into main, which by default squashes all lane snaps'),
        squash: z
          .boolean()
          .optional()
          .describe('Relevant for merging a lane into another non-main lane, which by default does not squash'),
        ignoreConfigChanges: z
          .boolean()
          .optional()
          .describe(
            'Allow merging when components are modified due to config changes (such as dependencies) only and not files'
          ),
        verbose: z
          .boolean()
          .optional()
          .describe('Display detailed information about components that were legitimately unmerged'),
        skipDependencyInstallation: z
          .boolean()
          .optional()
          .describe('Do not install dependencies of the imported components'),
        skipFetch: z
          .boolean()
          .optional()
          .describe('Use the local state of target-lane if exits locally, without updating it from the remote'),
        includeDeps: z.boolean().optional().describe('Merge also dependencies of the specified components'),
        resolveUnrelated: z
          .string()
          .optional()
          .describe(
            "Relevant when a component on a lane and the component on main have nothing in common. merge-strategy can be 'ours' (default) or 'theirs'"
          ),
        excludeNonLaneComps: z
          .boolean()
          .optional()
          .describe(
            'When merging main into a lane, exclude workspace components that are not on the lane (by default all workspace components are merged)'
          ),
      },
      async ({
        cwd,
        lane,
        pattern,
        manual,
        autoMergeResolve,
        ours,
        theirs,
        workspace,
        noAutoSnap,
        noSnap,
        tag,
        build,
        message,
        keepReadme,
        noSquash,
        squash,
        ignoreConfigChanges,
        verbose,
        skipDependencyInstallation,
        skipFetch,
        includeDeps,
        resolveUnrelated,
        excludeNonLaneComps,
      }) => {
        const args = ['lane', 'merge', lane];
        if (pattern) args.push(pattern);
        if (manual) args.push('--manual');
        if (autoMergeResolve) args.push('--auto-merge-resolve', autoMergeResolve);
        if (ours) args.push('--ours');
        if (theirs) args.push('--theirs');
        if (workspace) args.push('--workspace');
        if (noAutoSnap) args.push('--no-auto-snap');
        if (noSnap) args.push('--no-snap');
        if (tag) args.push('--tag');
        if (build) args.push('--build');
        if (message) args.push('--message', message);
        if (keepReadme) args.push('--keep-readme');
        if (noSquash) args.push('--no-squash');
        if (squash) args.push('--squash');
        if (ignoreConfigChanges) args.push('--ignore-config-changes');
        if (verbose) args.push('--verbose');
        if (skipDependencyInstallation) args.push('--skip-dependency-installation');
        if (skipFetch) args.push('--skip-fetch');
        if (includeDeps) args.push('--include-deps');
        if (resolveUnrelated) args.push('--resolve-unrelated', resolveUnrelated);
        if (excludeNonLaneComps) args.push('--exclude-non-lane-comps');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_templates'))
    server.tool(
      'bit_templates',
      "List available templates for 'bit create' and 'bit new'.",
      {
        ...cwdSchema,
        showAll: z.boolean().optional().describe('Show hidden templates'),
        aspect: z.string().optional().describe('Show templates provided by the aspect-id'),
      },
      async ({ cwd, showAll, aspect }) => {
        const args = ['templates'];
        if (showAll) args.push('--show-all');
        if (aspect) args.push('--aspect', aspect);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_reset'))
    server.tool(
      'bit_reset',
      'Revert tagged or snapped versions for component(s).',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        all: z.boolean().optional().describe('Revert all unexported tags/snaps for all components'),
        head: z
          .boolean()
          .optional()
          .describe('Revert the head tag/snap only (by default, all local tags/snaps are reverted)'),
        soft: z.boolean().optional().describe('Revert only soft-tags (components tagged with --soft flag)'),
        force: z
          .boolean()
          .optional()
          .describe(
            "Revert the tag even if it's used as a dependency. WARNING: components that depend on this tag will be corrupted"
          ),
        neverExported: z.boolean().optional().describe('Reset only components that were never exported'),
      },
      async ({ cwd, componentPattern, all, head, soft, force, neverExported }) => {
        const args = ['reset'];
        if (componentPattern) args.push(componentPattern);
        if (all) args.push('--all');
        if (head) args.push('--head');
        if (soft) args.push('--soft');
        if (force) args.push('--force');
        if (neverExported) args.push('--never-exported');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_fork'))
    server.tool(
      'bit_fork',
      'Create a new component forked from an existing one (copies source files and configs).',
      {
        ...cwdSchema,
        sourceComponentId: z.string().describe('The component id of the source component'),
        targetComponentName: z
          .string()
          .optional()
          .describe(
            "The name for the new component (component name without scope, e.g. name/spaces/my-button). To set a different scope, use the '--scope' flag"
          ),
        scope: z.string().optional().describe('Default scope for the new component'),
        path: z
          .string()
          .optional()
          .describe(
            'Relative path in the workspace for the new component. By default the path is <scope>/<namespace>/<name>'
          ),
        refactor: z
          .boolean()
          .optional()
          .describe('Update the import/require statements in all dependent components (in the same workspace)'),
        skipDependencyInstallation: z
          .boolean()
          .optional()
          .describe('Do not install packages of the imported components'),
        env: z.string().optional().describe('Set the environment for the new component'),
        skipConfig: z
          .boolean()
          .optional()
          .describe(
            'Do not copy the config (aspects-config, env, etc) to the new component. Helpful when it fails during aspect loading'
          ),
        preserve: z
          .boolean()
          .optional()
          .describe('Avoid refactoring file and variable/class names according to the new component name'),
        noLink: z.boolean().optional().describe('Avoid saving a reference to the original component'),
        ast: z.boolean().optional().describe('Use ast to transform files instead of regex'),
      },
      async ({
        cwd,
        sourceComponentId,
        targetComponentName,
        scope,
        path,
        refactor,
        skipDependencyInstallation,
        env,
        skipConfig,
        preserve,
        noLink,
        ast,
      }) => {
        const args = ['fork', sourceComponentId];
        if (targetComponentName) args.push(targetComponentName);
        if (scope) args.push('--scope', scope);
        if (path) args.push('--path', path);
        if (refactor) args.push('--refactor');
        if (skipDependencyInstallation) args.push('--skip-dependency-installation');
        if (env) args.push('--env', env);
        if (skipConfig) args.push('--skip-config');
        if (preserve) args.push('--preserve');
        if (noLink) args.push('--no-link');
        if (ast) args.push('--ast');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_rename'))
    server.tool(
      'bit_rename',
      'Rename component. If exported, create a new component and delete the original component. Otherwise just renames current component.',
      {
        ...cwdSchema,
        currentName: z.string().describe('The current component name (without its scope name)'),
        newName: z
          .string()
          .describe("The new component name (without its scope name. use --scope to define the new component's scope)"),
        scope: z.string().optional().describe('Define the scope for the new component'),
        refactor: z
          .boolean()
          .optional()
          .describe('Update the import/require statements in all dependent components (in the same workspace)'),
        preserve: z
          .boolean()
          .optional()
          .describe('Avoid renaming files and variables/classes according to the new component name'),
        ast: z.boolean().optional().describe('Use ast to transform files instead of regex'),
        deprecate: z.boolean().optional().describe('Instead of deleting the original component, deprecating it'),
        path: z.string().optional().describe('Relative path in the workspace to place new component in'),
      },
      async ({ cwd, currentName, newName, scope, refactor, preserve, ast, deprecate, path }) => {
        const args = ['rename', currentName, newName];
        if (scope) args.push('--scope', scope);
        if (refactor) args.push('--refactor');
        if (preserve) args.push('--preserve');
        if (ast) args.push('--ast');
        if (deprecate) args.push('--deprecate');
        if (path) args.push('--path', path);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_dependents'))
    server.tool(
      'bit_dependents',
      'Show dependents of the given component.',
      {
        ...cwdSchema,
        componentName: z.string().describe('Component name or component id'),
        json: z.boolean().optional().describe('Return the dependents in JSON format'),
      },
      async ({ cwd, componentName, json }) => {
        const args = ['dependents', componentName];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_compile'))
    server.tool(
      'bit_compile',
      'Compile components in the workspace.',
      {
        ...cwdSchema,
        componentNames: z
          .array(z.string())
          .optional()
          .describe('A list of component names or component IDs (defaults to all components)'),
        changed: z.boolean().optional().describe('Compile only new and modified components'),
        verbose: z.boolean().optional().describe('Show more data, such as, dist paths'),
        json: z.boolean().optional().describe('Return the compile results in json format'),
        deleteDistDir: z.boolean().optional().describe('Delete existing dist folder before writing new compiled files'),
        generateTypes: z
          .boolean()
          .optional()
          .describe('EXPERIMENTAL. generate d.ts files for typescript components (hurts performance)'),
      },
      async ({ cwd, componentNames, changed, verbose, json, deleteDistDir, generateTypes }) => {
        const args = ['compile'];
        if (componentNames && componentNames.length) args.push(...componentNames);
        if (changed) args.push('--changed');
        if (verbose) args.push('--verbose');
        if (json) args.push('--json');
        if (deleteDistDir) args.push('--delete-dist-dir');
        if (generateTypes) args.push('--generate-types');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_ws_config'))
    server.tool(
      'bit_ws_config',
      'Manage workspace config files (write, clean, list).',
      {
        ...cwdSchema,
        subCommand: z.enum(['write', 'clean', 'list']).describe('Sub-command: write, clean, or list'),
        file: z.string().optional().describe('Config file to write (for write sub-command)'),
        force: z.boolean().optional().describe('Force overwrite (for write sub-command)'),
      },
      async ({ cwd, subCommand, file, force }) => {
        const args = ['ws-config', subCommand];
        if (file) args.push(file);
        if (force) args.push('--force');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_stash'))
    server.tool(
      'bit_stash',
      'Stash modified components (save, load, list).',
      {
        ...cwdSchema,
        subCommand: z.enum(['save', 'load', 'list']).describe('Sub-command: save, load, or list'),
        name: z.string().optional().describe('Name of the stash (for save/load sub-commands)'),
      },
      async ({ cwd, subCommand, name }) => {
        const args = ['stash', subCommand];
        if (name) args.push(name);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_schema'))
    server.tool(
      'bit_schema',
      'Shows the API schema of the specified component(s).',
      {
        ...cwdSchema,
        pattern: z
          .string()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        json: z.boolean().optional().describe('Return the component schema in json format'),
      },
      async ({ cwd, pattern, json }) => {
        const args = ['schema', pattern];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_check_types'))
    server.tool(
      'bit_check_types',
      'Check typescript types.',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        all: z.boolean().optional().describe('Check-types for all components, not only modified and new'),
        strict: z.boolean().optional().describe('In case issues found, exit with code 1'),
        json: z.boolean().optional().describe('Return the output in json format'),
      },
      async ({ cwd, componentPattern, all, strict, json }) => {
        const args = ['check-types'];
        if (componentPattern) args.push(componentPattern);
        if (all) args.push('--all');
        if (strict) args.push('--strict');
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_aspect'))
    server.tool(
      'bit_aspect',
      'Manage aspects (list, list-core, get, set, unset, update).',
      {
        ...cwdSchema,
        subCommand: z
          .enum(['list', 'list-core', 'get', 'set', 'unset', 'update'])
          .describe('Sub-command: list, list-core, get, set, unset, update'),
        pattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        aspectId: z.string().optional().describe("The aspect's component id"),
        config: z
          .string()
          .optional()
          .describe('The aspect config. Enter the config as a stringified JSON (for set sub-command)'),
        merge: z.boolean().optional().describe('Merge with an existing config if exists (for set sub-command)'),
        debug: z
          .boolean()
          .optional()
          .describe('Show the origins where the aspects were taken from (for list/get sub-commands)'),
        json: z.boolean().optional().describe('Format as json (for list-core/get sub-commands)'),
      },
      async ({ cwd, subCommand, pattern, aspectId, config, merge, debug, json }) => {
        const args = ['aspect', subCommand];
        if (subCommand === 'list' && pattern) args.push(pattern);
        if (subCommand === 'list' && debug) args.push('--debug');
        if (subCommand === 'list-core' && json) args.push('--json');
        if (subCommand === 'get' && aspectId) args.push(aspectId);
        if (subCommand === 'get' && debug) args.push('--debug');
        if (subCommand === 'get' && json) args.push('--json');
        if (subCommand === 'set' && pattern && aspectId) {
          args.push(pattern, aspectId);
          if (config) args.push(config);
          if (merge) args.push('--merge');
        }
        if (subCommand === 'unset' && pattern && aspectId) args.push(pattern, aspectId);
        if (subCommand === 'update' && aspectId) {
          args.push(aspectId);
          if (pattern) args.push(pattern);
        }
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_refactor'))
    server.tool(
      'bit_refactor',
      'Source code refactoring / codemod.',
      {
        ...cwdSchema,
        name: z.string().describe('Name of the refactor/codemod to run'),
        pattern: z
          .string()
          .optional()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        dryRun: z.boolean().optional().describe("Show what changes would be made, but don't write them"),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, name, pattern, dryRun, json }) => {
        const args = ['refactor', name];
        if (pattern) args.push(pattern);
        if (dryRun) args.push('--dry-run');
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_why'))
    server.tool(
      'bit_why',
      'Find components that use the specified dependency.',
      {
        ...cwdSchema,
        dependency: z.string().describe('Dependency name or id to search for'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, dependency, json }) => {
        const args = ['why', dependency];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_app'))
    server.tool(
      'bit_app',
      'Manages apps (list, run).',
      {
        ...cwdSchema,
        subCommand: z.enum(['list', 'run']).describe('Sub-command: list or run'),
        name: z.string().optional().describe('Name of the app to run (for run sub-command)'),
        port: z.string().optional().describe('Port to run the app on (for run sub-command)'),
      },
      async ({ cwd, subCommand, name, port }) => {
        if (subCommand === 'run') {
          let cmd = `bit app run`;
          if (name) cmd += ` ${name}`;
          if (port) cmd += ` --port ${port}`;
          return {
            content: [
              {
                type: 'text',
                text: `The 'bit app run' command starts a long-running process (like a dev server or watcher) and will not terminate on its own. For this reason, it cannot be run through MCP. Please run this command directly in your terminal instead:\n\n${cmd}`,
              },
            ],
          };
        }
        // ...existing code for 'list'...
        const args = ['app', subCommand];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_insight'))
    server.tool(
      'bit_insight',
      'Run insights on the workspace or a specific component.',
      {
        ...cwdSchema,
        name: z.string().optional().describe('Name of the insight to run (if omitted, runs all insights)'),
        component: z.string().optional().describe('Component name or id to run the insight on'),
        json: z.boolean().optional().describe('Return the output in JSON format'),
      },
      async ({ cwd, name, component, json }) => {
        const args = ['insight'];
        if (name) args.push(name);
        if (component) args.push('--component', component);
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps'))
    server.tool(
      'bit_deps',
      'Manage dependencies.',
      {
        ...cwdSchema,
        component: z.string().describe('Component name or id to show dependencies for'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, component, json }) => {
        const args = ['deps', component];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_log_file'))
    server.tool(
      'bit_log_file',
      'Show file history (EXPERIMENTAL).',
      {
        ...cwdSchema,
        file: z.string().describe('File path to show history for'),
        component: z.string().optional().describe('Component name or id (optional, for disambiguation)'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, file, component, json }) => {
        const args = ['log-file', file];
        if (component) args.push('--component', component);
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_blame'))
    server.tool(
      'bit_blame',
      'Show per-line last modification info for a file (EXPERIMENTAL).',
      {
        ...cwdSchema,
        file: z.string().describe('File path to show blame info for'),
        component: z.string().optional().describe('Component name or id (optional, for disambiguation)'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, file, component, json }) => {
        const args = ['blame', file];
        if (component) args.push('--component', component);
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_scope'))
    server.tool(
      'bit_scope',
      'Manage the scope-name for components.',
      {
        ...cwdSchema,
        name: z.string().optional().describe('Scope name to set or show'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, name, json }) => {
        const args = ['scope'];
        if (name) args.push(name);
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps_get'))
    server.tool(
      'bit_deps_get',
      'Show direct and indirect dependencies of the given component.',
      {
        ...cwdSchema,
        component: z.string().describe('Component name or id to show dependencies for'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, component, json }) => {
        const args = ['deps', 'get', component];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps_remove'))
    server.tool(
      'bit_deps_remove',
      'Remove a dependency from one or more components.',
      {
        ...cwdSchema,
        componentPattern: z.string().describe('Component pattern to match components'),
        packages: z.array(z.string()).describe('Packages to remove'),
      },
      async ({ cwd, componentPattern, packages }) => {
        const args = ['deps', 'remove', componentPattern, ...packages];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps_unset'))
    server.tool(
      'bit_deps_unset',
      'Unset a dependency to component(s) that was set via config.',
      {
        ...cwdSchema,
        componentPattern: z.string().describe('Component pattern to match components'),
        packages: z.array(z.string()).describe('Packages to unset'),
      },
      async ({ cwd, componentPattern, packages }) => {
        const args = ['deps', 'unset', componentPattern, ...packages];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps_debug'))
    server.tool(
      'bit_deps_debug',
      'Show the immediate dependencies and how their versions were determined.',
      {
        ...cwdSchema,
        component: z.string().describe('Component name or id to debug dependencies for'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, component, json }) => {
        const args = ['deps', 'debug', component];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps_set'))
    server.tool(
      'bit_deps_set',
      'Set a dependency to component(s).',
      {
        ...cwdSchema,
        componentPattern: z.string().describe('Component pattern to match components'),
        packages: z.array(z.string()).describe('Packages to set as dependencies'),
      },
      async ({ cwd, componentPattern, packages }) => {
        const args = ['deps', 'set', componentPattern, ...packages];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps_reset'))
    server.tool(
      'bit_deps_reset',
      'Reset dependencies to the default values.',
      {
        ...cwdSchema,
        componentPattern: z.string().describe('Component pattern to reset dependencies for'),
      },
      async ({ cwd, componentPattern }) => {
        const args = ['deps', 'reset', componentPattern];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps_eject'))
    server.tool(
      'bit_deps_eject',
      "Write dependencies that were previously set via 'bit deps set' into .bitmap.",
      {
        ...cwdSchema,
        componentPattern: z.string().describe('Component pattern to eject dependencies for'),
      },
      async ({ cwd, componentPattern }) => {
        const args = ['deps', 'eject', componentPattern];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps_blame'))
    server.tool(
      'bit_deps_blame',
      'Find out which snap/tag changed a dependency version.',
      {
        ...cwdSchema,
        component: z.string().describe('Component name or id'),
        dependency: z.string().describe('Dependency name'),
      },
      async ({ cwd, component, dependency }) => {
        const args = ['deps', 'blame', component, dependency];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps_usage'))
    server.tool(
      'bit_deps_usage',
      'Find components that use the specified dependency.',
      {
        ...cwdSchema,
        dependency: z.string().describe('Dependency name'),
      },
      async ({ cwd, dependency }) => {
        const args = ['deps', 'usage', dependency];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_deps_write'))
    server.tool(
      'bit_deps_write',
      'Write all workspace component dependencies to package.json or workspace.jsonc, resolving conflicts by picking the ranges that match the highest versions.',
      {
        ...cwdSchema,
      },
      async ({ cwd }) => {
        const args = ['deps', 'write'];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_artifacts'))
    server.tool(
      'bit_artifacts',
      'List and download component artifacts.',
      {
        ...cwdSchema,
        component: z.string().optional().describe('Component name or id to show artifacts for'),
        task: z.string().optional().describe('Task name to filter artifacts'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, component, task, json }) => {
        const args = ['artifacts'];
        if (component) args.push(component);
        if (task) args.push('--task', task);
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_globals'))
    server.tool(
      'bit_globals',
      'List all globals.',
      {
        ...cwdSchema,
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, json }) => {
        const args = ['globals'];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_system'))
    server.tool(
      'bit_system',
      'System operations.',
      {
        ...cwdSchema,
        subCommand: z.enum(['log']).describe("System sub-command to run (currently only 'log' is supported)"),
      },
      async ({ cwd, subCommand }) => {
        const args = ['system', subCommand];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_eject'))
    server.tool(
      'bit_eject',
      'Remove component from the workspace and install it instead as a regular npm package.',
      {
        ...cwdSchema,
        componentPattern: z
          .string()
          .describe(
            'Component name, component id, or component pattern. Use component pattern to select multiple components.'
          ),
        force: z
          .boolean()
          .optional()
          .describe('Eject even if the component is used as a dependency by other components in the workspace'),
        keepFiles: z.boolean().optional().describe('Keep component files in the workspace after ejecting'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, componentPattern, force, keepFiles, json }) => {
        const args = ['eject', componentPattern];
        if (force) args.push('--force');
        if (keepFiles) args.push('--keep-files');
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_change_scope'))
    server.tool(
      'bit_lane_change_scope',
      'Change the remote scope of a lane.',
      {
        ...cwdSchema,
        remoteScope: z.string().describe('Remote scope name to set for the lane'),
      },
      async ({ cwd, remoteScope }) => {
        const args = ['lane', 'change-scope', remoteScope];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_import'))
    server.tool(
      'bit_lane_import',
      'Import a remote lane to your workspace and switch to that lane.',
      {
        ...cwdSchema,
        lane: z.string().describe('Lane name or id to import'),
      },
      async ({ cwd, lane }) => {
        const args = ['lane', 'import', lane];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_fetch'))
    server.tool(
      'bit_lane_fetch',
      'Fetch component objects from lanes.',
      {
        ...cwdSchema,
        laneId: z.string().optional().describe('Lane id to fetch from (optional, defaults to current lane)'),
      },
      async ({ cwd, laneId }) => {
        const args = ['lane', 'fetch'];
        if (laneId) args.push(laneId);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_eject'))
    server.tool(
      'bit_lane_eject',
      'Delete a component from the lane and install it as a package from main.',
      {
        ...cwdSchema,
        componentPattern: z.string().describe('Component pattern to eject from the lane'),
      },
      async ({ cwd, componentPattern }) => {
        const args = ['lane', 'eject', componentPattern];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_history'))
    server.tool(
      'bit_lane_history',
      'Show lane history (experimental).',
      {
        ...cwdSchema,
        laneName: z.string().optional().describe('Lane name to show history for (optional, defaults to current lane)'),
      },
      async ({ cwd, laneName }) => {
        const args = ['lane', 'history'];
        if (laneName) args.push(laneName);
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_history_diff'))
    server.tool(
      'bit_lane_history_diff',
      'Show diff between two lane-history ids (experimental).',
      {
        ...cwdSchema,
        fromHistoryId: z.string().describe('From history id'),
        toHistoryId: z.string().describe('To history id'),
      },
      async ({ cwd, fromHistoryId, toHistoryId }) => {
        const args = ['lane', 'history-diff', fromHistoryId, toHistoryId];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_checkout'))
    server.tool(
      'bit_lane_checkout',
      'Checkout to a previous history of the current lane (experimental).',
      {
        ...cwdSchema,
        historyId: z.string().describe('History id to checkout to'),
      },
      async ({ cwd, historyId }) => {
        const args = ['lane', 'checkout', historyId];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_revert'))
    server.tool(
      'bit_lane_revert',
      'Revert to a previous history of the current lane (experimental).',
      {
        ...cwdSchema,
        historyId: z.string().describe('History id to revert to'),
      },
      async ({ cwd, historyId }) => {
        const args = ['lane', 'revert', historyId];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_merge_abort'))
    server.tool(
      'bit_lane_merge_abort',
      'Abort the recent lane-merge. Revert the lane object and checkout accordingly.',
      {
        ...cwdSchema,
      },
      async ({ cwd }) => {
        const args = ['lane', 'merge-abort'];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_lane_merge_move'))
    server.tool(
      'bit_lane_merge_move',
      'Move the current merge state into a new lane (experimental).',
      {
        ...cwdSchema,
        newLaneName: z.string().describe('New lane name to move the merge state into'),
      },
      async ({ cwd, newLaneName }) => {
        const args = ['lane', 'merge-move', newLaneName];
        return runBit(cwd, args);
      }
    );

  if (shouldRegisterTool('bit_pattern'))
    server.tool(
      'bit_pattern',
      'Show the list of components matching a given pattern.',
      {
        ...cwdSchema,
        pattern: z.string().describe('Component pattern to match components'),
        json: z.boolean().optional().describe('Return the output as JSON'),
      },
      async ({ cwd, pattern, json }) => {
        const args = ['pattern', pattern];
        if (json) args.push('--json');
        return runBit(cwd, args);
      }
    );

  await server.connect(new StdioServerTransport());
}

// // eslint-disable-next-line @typescript-eslint/no-floating-promises
// (async () => {
//   await server.connect(new StdioServerTransport());
// })();
