/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */

import { expect } from 'chai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import fs from 'fs-extra';
import path from 'path';

import { CliMcpServerAspect } from './cli-mcp-server.aspect';
import type { CliMcpServerMain } from './cli-mcp-server.main.runtime';

describe('CliMcpServer Integration Tests', function () {
  this.timeout(30000); // Increased timeout for MCP server operations

  let workspaceData: WorkspaceData;
  let mcpClient: Client;
  let workspacePath: string;

  before(async () => {
    // Set up mock workspace with components
    workspaceData = mockWorkspace();
    workspacePath = workspaceData.workspacePath;
    await mockComponents(workspacePath);
  });

  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  beforeEach(async () => {
    // Create MCP client and connect directly to the MCP server command
    const transport = new StdioClientTransport({
      command: 'bit',
      args: ['mcp-server', 'start'],
      cwd: workspacePath,
    });

    mcpClient = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await mcpClient.connect(transport);
  });

  afterEach(async () => {
    // Clean up MCP client
    if (mcpClient) {
      await mcpClient.close();
    }
  });

  describe('MCP Server Protocol', () => {
    it('should list available tools', async () => {
      const response = await mcpClient.listTools();

      expect(response.tools).to.be.an('array');
      expect(response.tools.length).to.be.greaterThan(0);

      // Check for essential MCP tools
      const toolNames = response.tools.map((tool) => tool.name);
      expect(toolNames).to.include('bit_workspace_info');
      expect(toolNames).to.include('bit_component_details');
      expect(toolNames).to.include('bit_commands_list');
      expect(toolNames).to.include('bit_query');
      expect(toolNames).to.include('bit_execute');
    });
  });

  describe('Consumer Project Mode', () => {
    let consumerProjectClient: Client;

    beforeEach(async () => {
      // Create MCP client for consumer project mode
      const transport = new StdioClientTransport({
        command: 'bit',
        args: ['mcp-server', 'start', '--consumer-project'],
        cwd: workspacePath,
      });

      consumerProjectClient = new Client(
        {
          name: 'test-consumer-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await consumerProjectClient.connect(transport);
    });

    afterEach(async () => {
      if (consumerProjectClient) {
        await consumerProjectClient.close();
      }
    });

    it('should only enable bit_remote_search and bit_remote_component_details tools', async () => {
      const response = await consumerProjectClient.listTools();

      expect(response.tools).to.be.an('array');

      const toolNames = response.tools.map((tool) => tool.name);

      // Should include only these two tools
      expect(toolNames).to.include('bit_remote_search');
      expect(toolNames).to.include('bit_remote_component_details');

      // Should NOT include these tools that are available in regular mode
      expect(toolNames).to.not.include('bit_workspace_info');
      expect(toolNames).to.not.include('bit_component_details');
      expect(toolNames).to.not.include('bit_commands_list');
      expect(toolNames).to.not.include('bit_command_help');
      expect(toolNames).to.not.include('bit_query');
      expect(toolNames).to.not.include('bit_execute');

      // Should NOT include the old separate tools
      expect(toolNames).to.not.include('bit_show');
      expect(toolNames).to.not.include('bit_schema');

      // Should have exactly 2 tools
      expect(toolNames).to.have.lengthOf(2);
    });

    it('should work with bit_remote_search tool', async () => {
      const result = (await consumerProjectClient.callTool({
        name: 'bit_remote_search',
        arguments: {
          queries: ['button'],
          cwd: workspacePath,
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');
    });
  });

  describe('bit_workspace_info tool', () => {
    it('should get workspace information', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_workspace_info',
        arguments: {
          cwd: workspacePath,
          includeStatus: true,
          includeList: true,
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = JSON.parse((result.content[0] as any).text);
      expect(content).to.have.property('status');
      expect(content).to.have.property('list');
    });

    it('should handle workspace info without optional parameters', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_workspace_info',
        arguments: {
          cwd: workspacePath,
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = JSON.parse((result.content[0] as any).text);
      expect(content).to.have.property('status');
    });
  });

  describe('bit_component_details tool', () => {
    it('should get component details for an existing component', async () => {
      const firstComponentId = 'comp1';

      const result = (await mcpClient.callTool({
        name: 'bit_component_details',
        arguments: {
          cwd: workspacePath,
          componentName: firstComponentId,
          includeSchema: false,
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = JSON.parse((result.content[0] as any).text);
      expect(content).to.have.property('id');
      expect(content).to.have.property('env');
    });

    it('should get component details with schema', async () => {
      const firstComponentId = 'comp1';

      const result = (await mcpClient.callTool({
        name: 'bit_component_details',
        arguments: {
          cwd: workspacePath,
          componentName: firstComponentId,
          includeSchema: true,
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = JSON.parse((result.content[0] as any).text);
      expect(content).to.have.property('id');
      expect(content).to.have.property('publicAPI');
    });

    it('should handle non-existent component gracefully', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_component_details',
        arguments: {
          cwd: workspacePath,
          componentName: 'non-existent/component',
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      // Should return error information or component details
      const content = (result.content[0] as any).text;
      expect(content).to.be.a('string');
    });
  });

  describe('bit_commands_list tool', () => {
    it('should get basic commands list', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_commands_list',
        arguments: {},
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = JSON.parse((result.content[0] as any).text);
      expect(content).to.have.property('commands');
      expect(content.commands).to.be.an('array');
      expect(content.commands.length).to.be.greaterThan(0);

      // Check command structure
      const firstCommand = content.commands[0];
      expect(firstCommand).to.have.property('name');
      expect(firstCommand).to.have.property('description');
    });

    it('should get commands info with extended description', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_commands_list',
        arguments: {
          extendedDescription: true,
          internal: false,
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = JSON.parse((result.content[0] as any).text);
      expect(content).to.have.property('commands');
      expect(content.commands).to.be.an('array');
      expect(content.commands.length).to.be.greaterThan(0);
    });
  });

  describe('bit_command_help tool', () => {
    it('should get help for a main command', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_command_help',
        arguments: {
          command: 'status',
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = JSON.parse((result.content[0] as any).text);
      expect(content).to.have.property('name', 'status');
      expect(content).to.have.property('description');
      expect(content).to.have.property('options');
    });

    it('should get help for lane switch subcommand (private command)', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_command_help',
        arguments: {
          command: 'lane',
          subcommand: 'switch',
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = JSON.parse((result.content[0] as any).text);
      expect(content).to.have.property('name', 'lane switch');
      expect(content).to.have.property('description');
      expect(content.description).to.include('switch to the specified lane');
      expect(content).to.have.property('arguments');
      expect(content.arguments).to.be.an('array');
      expect(content.arguments[0]).to.have.property('name', 'lane');
      expect(content.arguments[0]).to.have.property('description');
    });

    it('should get help for a subcommand that exists', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_command_help',
        arguments: {
          command: 'lane',
          subcommand: 'show',
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = JSON.parse((result.content[0] as any).text);
      expect(content).to.have.property('name', 'lane show');
      expect(content).to.have.property('description');
    });

    it('should return error for non-existent command', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_command_help',
        arguments: {
          command: 'nonexistent',
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = (result.content[0] as any).text;
      expect(content).to.include('Command not found: nonexistent');
    });

    it('should return error for non-existent subcommand', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_command_help',
        arguments: {
          command: 'lane',
          subcommand: 'nonexistent',
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = (result.content[0] as any).text;
      expect(content).to.include('Command not found: lane nonexistent');
    });
  });

  describe('bit_query tool', () => {
    it('should execute read-only commands', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_query',
        arguments: {
          cwd: workspacePath,
          command: 'status',
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      // Should return command output
      const content = (result.content[0] as any).text;
      expect(content).to.be.a('string');
    });

    it('should handle commands with arguments and flags', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_query',
        arguments: {
          cwd: workspacePath,
          command: 'list',
          args: [],
          flags: {
            json: true,
          },
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = (result.content[0] as any).text;
      expect(content).to.be.a('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool calls gracefully', async () => {
      try {
        await mcpClient.callTool({
          name: 'non_existent_tool',
          arguments: {},
        });
        expect.fail('Should have thrown an error for non-existent tool');
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it('should handle invalid workspace directory', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_workspace_info',
        arguments: {
          cwd: '/non/existent/path',
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      // Should return error information
      const content = (result.content[0] as any).text;
      expect(content).to.be.a('string');
    });
  });
});

describe('CliMcpServer Direct Aspect Tests', function () {
  this.timeout(30000);

  let workspaceData: WorkspaceData;
  let mcpServer: CliMcpServerMain;
  let workspacePath: string;

  before(async () => {
    // Set up mock workspace with components
    workspaceData = mockWorkspace();
    workspacePath = workspaceData.workspacePath;
    await mockComponents(workspacePath);

    // Load the aspect directly
    mcpServer = await loadAspect(CliMcpServerAspect, workspacePath);
  });

  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  describe('Setup Editor Methods', () => {
    let setupWorkspaceData: WorkspaceData;
    let setupWorkspacePath: string;
    let setupMcpServer: CliMcpServerMain;

    beforeEach(async () => {
      // Create a separate mock workspace for setup testing
      setupWorkspaceData = mockWorkspace();
      setupWorkspacePath = setupWorkspaceData.workspacePath;
      await mockComponents(setupWorkspacePath);

      // Load the aspect for this workspace
      setupMcpServer = await loadAspect(CliMcpServerAspect, setupWorkspacePath);
    });

    afterEach(async () => {
      // Clean up the setup workspace
      if (setupWorkspaceData) {
        await destroyWorkspace(setupWorkspaceData);
      }
    });

    it('should handle unsupported editor gracefully', async () => {
      try {
        await mcpServer.setupEditor('unsupported-editor', {
          isGlobal: false,
        });
        expect.fail('Should have thrown an error for unsupported editor');
      } catch (error) {
        expect(error).to.exist;
        expect((error as Error).message).to.include('Editor "unsupported-editor" is not supported yet');
        expect((error as Error).message).to.include('Currently supported: vscode, cursor, windsurf, roo, cline');
      }
    });

    it('should setup VS Code integration directly', async () => {
      await setupMcpServer.setupEditor(
        'vscode',
        {
          isGlobal: false,
        },
        setupWorkspacePath
      );

      // Verify that the mcp.json file was created in the workspace directory
      const vscodeMcpPath = path.join(setupWorkspacePath, '.vscode', 'mcp.json');
      const mcpExists = await fs.pathExists(vscodeMcpPath);
      expect(mcpExists).to.be.true;

      // Verify the content of the mcp.json file
      const mcpConfig = await fs.readJson(vscodeMcpPath);
      expect(mcpConfig).to.have.property('servers');
      expect(mcpConfig.servers).to.have.property('bit-cli');
      expect(mcpConfig.servers['bit-cli']).to.deep.equal({
        type: 'stdio',
        command: 'bit',
        args: ['mcp-server', 'start'],
      });
    });

    it('should setup VS Code integration with consumer project options', async () => {
      await setupMcpServer.setupEditor(
        'vscode',
        {
          consumerProject: true,
          includeAdditional: 'status,list',
          isGlobal: false,
        },
        setupWorkspacePath
      );

      const vscodeMcpPath = path.join(setupWorkspacePath, '.vscode', 'mcp.json');
      const mcpConfig = await fs.readJson(vscodeMcpPath);

      expect(mcpConfig.servers['bit-cli'].args).to.include('--consumer-project');
      expect(mcpConfig.servers['bit-cli'].args).to.include('--include-additional');
      expect(mcpConfig.servers['bit-cli'].args).to.include('status,list');
    });

    it('should setup Cursor integration directly', async () => {
      await setupMcpServer.setupEditor(
        'cursor',
        {
          isGlobal: false,
        },
        setupWorkspacePath
      );

      // Verify that the mcp.json file was created in the workspace directory
      const cursorConfigPath = path.join(setupWorkspacePath, '.cursor', 'mcp.json');
      const configExists = await fs.pathExists(cursorConfigPath);
      expect(configExists).to.be.true;

      // Verify the content of the config file
      const config = await fs.readJson(cursorConfigPath);
      expect(config).to.have.property('mcpServers');
      expect(config.mcpServers).to.have.property('bit');
      expect(config.mcpServers.bit).to.deep.equal({
        type: 'stdio',
        command: 'bit',
        args: ['mcp-server', 'start'],
      });
    });

    it('should setup Windsurf integration directly', async () => {
      await setupMcpServer.setupEditor(
        'windsurf',
        {
          isGlobal: false,
        },
        setupWorkspacePath
      );

      // Verify that the mcp.json file was created in the workspace directory
      const windsurfConfigPath = path.join(setupWorkspacePath, '.windsurf', 'mcp.json');
      const configExists = await fs.pathExists(windsurfConfigPath);
      expect(configExists).to.be.true;

      // Verify the content of the config file
      const config = await fs.readJson(windsurfConfigPath);
      expect(config).to.have.property('mcpServers');
      expect(config.mcpServers).to.have.property('bit');
      expect(config.mcpServers.bit).to.deep.equal({
        type: 'stdio',
        command: 'bit',
        args: ['mcp-server', 'start'],
      });
    });

    it('should setup Roo Code integration directly', async () => {
      await setupMcpServer.setupEditor(
        'roo',
        {
          isGlobal: false,
        },
        setupWorkspacePath
      );

      // Verify that the mcp.json file was created in the workspace directory
      const rooConfigPath = path.join(setupWorkspacePath, '.roo', 'mcp.json');
      const configExists = await fs.pathExists(rooConfigPath);
      expect(configExists).to.be.true;

      // Verify the content of the config file
      const config = await fs.readJson(rooConfigPath);
      expect(config).to.have.property('mcpServers');
      expect(config.mcpServers).to.have.property('bit');
      expect(config.mcpServers.bit).to.deep.equal({
        type: 'stdio',
        command: 'bit',
        args: ['mcp-server', 'start'],
      });
    });

    it('should throw error when trying to setup Roo Code globally', async () => {
      try {
        await setupMcpServer.setupEditor(
          'roo',
          {
            isGlobal: true,
          },
          setupWorkspacePath
        );
        expect.fail('Should have thrown an error for global Roo Code setup');
      } catch (error) {
        expect(error).to.exist;
        expect((error as Error).message).to.include('Roo Code global configuration is not supported');
        expect((error as Error).message).to.include('VS Code internal storage that cannot be accessed');
      }
    });

    it('should merge with existing VS Code mcp.json config', async () => {
      // First, create existing MCP config
      const vscodeMcpPath = path.join(setupWorkspacePath, '.vscode', 'mcp.json');
      await fs.ensureDir(path.dirname(vscodeMcpPath));
      await fs.writeJson(vscodeMcpPath, {
        servers: {
          'existing-server': {
            type: 'stdio',
            command: 'some-other-command',
            args: ['start'],
          },
        },
      });

      // Run setup
      await setupMcpServer.setupEditor(
        'vscode',
        {
          isGlobal: false,
        },
        setupWorkspacePath
      );

      // Verify that existing MCP config is preserved and Bit config is added
      const mcpConfig = await fs.readJson(vscodeMcpPath);
      expect(mcpConfig.servers).to.have.property('existing-server');
      expect(mcpConfig.servers['existing-server']).to.deep.equal({
        type: 'stdio',
        command: 'some-other-command',
        args: ['start'],
      });
      expect(mcpConfig.servers).to.have.property('bit-cli');
      expect(mcpConfig.servers['bit-cli']).to.deep.equal({
        type: 'stdio',
        command: 'bit',
        args: ['mcp-server', 'start'],
      });
    });
  });

  describe('Rules Methods', () => {
    it('should get rules content without error', async () => {
      // This test reproduces the bug where bit-rules-template.md was not found
      const rulesContent = await mcpServer.getRulesContent(false);
      expect(rulesContent).to.be.a('string');
      expect(rulesContent).to.contain('# Bit MCP Agent Instructions');
      expect(rulesContent).to.contain('Core Objectives');
    });

    it('should get consumer project rules content without error', async () => {
      const rulesContent = await mcpServer.getRulesContent(true);
      expect(rulesContent).to.be.a('string');
      expect(rulesContent).to.contain('## How to Install and Use Bit Components');
      expect(rulesContent).to.contain('Bit Components are reusable pieces of code');
    });

    it('should write rules file for VS Code without error', async () => {
      await mcpServer.writeRulesFile(
        'vscode',
        {
          isGlobal: false,
          consumerProject: false,
        },
        workspacePath
      );

      // Check that the rules file was created
      const rulesPath = path.join(workspacePath, '.github', 'instructions', 'bit.instructions.md');
      const rulesExists = await fs.pathExists(rulesPath);
      expect(rulesExists).to.be.true;

      // Check content
      const rulesContent = await fs.readFile(rulesPath, 'utf8');
      expect(rulesContent).to.contain('# Bit MCP Agent Instructions');
      expect(rulesContent).to.contain('Core Objectives');
    });

    it('should write consumer project rules file without error', async () => {
      await mcpServer.writeRulesFile(
        'vscode',
        {
          isGlobal: false,
          consumerProject: true,
        },
        workspacePath
      );

      // Check that the rules file was created
      const rulesPath = path.join(workspacePath, '.github', 'instructions', 'bit.instructions.md');
      const rulesExists = await fs.pathExists(rulesPath);
      expect(rulesExists).to.be.true;

      // Check content is different for consumer project
      const rulesContent = await fs.readFile(rulesPath, 'utf8');
      expect(rulesContent).to.contain('## How to Install and Use Bit Components');
      expect(rulesContent).to.contain('Bit Components are reusable pieces of code');
    });
  });
});
