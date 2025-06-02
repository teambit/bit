/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */

import { expect } from 'chai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { loadAspect } from '@teambit/harmony.testing.load-aspect';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';
import { CliMcpServerAspect } from './cli-mcp-server.aspect';
import { CliMcpServerMain } from './cli-mcp-server.main.runtime';

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
      args: ['mcp-server'],
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
      expect(toolNames).to.include('bit_commands_info');
      expect(toolNames).to.include('bit_query');
      expect(toolNames).to.include('bit_execute');
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
      expect(content).to.have.property('show');
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
      expect(content).to.have.property('show');
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

  describe('bit_commands_info tool', () => {
    it('should get basic commands info', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_commands_info',
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

    it('should get extended commands info', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_commands_info',
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

    it('should get specific command info', async () => {
      const result = (await mcpClient.callTool({
        name: 'bit_commands_info',
        arguments: {
          command: 'status',
        },
      })) as CallToolResult;

      expect(result).to.have.property('content');
      expect(result.content).to.be.an('array');
      expect(result.content[0]).to.have.property('type', 'text');

      const content = JSON.parse((result.content[0] as any).text);
      expect(content).to.have.property('commands');
      expect(content.commands).to.be.an('array');

      // Should contain status command info
      const statusCommand = content.commands.find((cmd: any) => cmd.name === 'status');
      expect(statusCommand).to.exist;
      expect(statusCommand).to.have.property('description');
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
    let tempDir: string;

    beforeEach(async () => {
      // Create a temporary directory for testing VS Code settings
      tempDir = await fs.mkdtemp(path.join(tmpdir(), 'bit-mcp-direct-test-'));
      // Change cwd to temp directory for testing
      process.chdir(tempDir);
    });

    afterEach(async () => {
      // Clean up temporary directory
      if (tempDir) {
        await fs.remove(tempDir);
      }
      // Change back to original workspace
      process.chdir(workspacePath);
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
        expect((error as Error).message).to.include('Currently supported: vscode, cursor, windsurf');
      }
    });

    it('should setup VS Code integration directly', async () => {
      await mcpServer.setupEditor('vscode', {
        isGlobal: false,
      });

      // Verify that the settings.json file was created in the current directory
      const vscodeSettingsPath = path.join(process.cwd(), '.vscode', 'settings.json');
      const settingsExists = await fs.pathExists(vscodeSettingsPath);
      expect(settingsExists).to.be.true;

      // Verify the content of the settings file
      const settings = await fs.readJson(vscodeSettingsPath);
      expect(settings).to.have.property('mcp');
      expect(settings.mcp).to.have.property('servers');
      expect(settings.mcp.servers).to.have.property('bit-cli');
      expect(settings.mcp.servers['bit-cli']).to.deep.equal({
        command: 'bit',
        args: ['mcp-server'],
      });
    });

    it('should setup VS Code integration with extended options', async () => {
      await mcpServer.setupEditor('vscode', {
        extended: true,
        consumerProject: true,
        includeOnly: 'status,list',
        isGlobal: false,
      });

      const vscodeSettingsPath = path.join(process.cwd(), '.vscode', 'settings.json');
      const settings = await fs.readJson(vscodeSettingsPath);

      expect(settings.mcp.servers['bit-cli'].args).to.include('--extended');
      expect(settings.mcp.servers['bit-cli'].args).to.include('--consumer-project');
      expect(settings.mcp.servers['bit-cli'].args).to.include('--include-only');
      expect(settings.mcp.servers['bit-cli'].args).to.include('status,list');
    });

    it('should setup Cursor integration directly', async () => {
      await mcpServer.setupEditor('cursor', {
        isGlobal: false,
      });

      // Verify that the mcp.json file was created in the current directory
      const cursorConfigPath = path.join(process.cwd(), '.cursor', 'mcp.json');
      const configExists = await fs.pathExists(cursorConfigPath);
      expect(configExists).to.be.true;

      // Verify the content of the config file
      const config = await fs.readJson(cursorConfigPath);
      expect(config).to.have.property('mcpServers');
      expect(config.mcpServers).to.have.property('bit');
      expect(config.mcpServers.bit).to.deep.equal({
        type: 'stdio',
        command: 'bit',
        args: ['mcp-server'],
      });
    });

    it('should setup Windsurf integration directly', async () => {
      await mcpServer.setupEditor('windsurf', {
        isGlobal: false,
      });

      // Verify that the mcp.json file was created in the current directory
      const windsurfConfigPath = path.join(process.cwd(), '.windsurf', 'mcp.json');
      const configExists = await fs.pathExists(windsurfConfigPath);
      expect(configExists).to.be.true;

      // Verify the content of the config file
      const config = await fs.readJson(windsurfConfigPath);
      expect(config).to.have.property('mcpServers');
      expect(config.mcpServers).to.have.property('bit');
      expect(config.mcpServers.bit).to.deep.equal({
        type: 'stdio',
        command: 'bit',
        args: ['mcp-server'],
      });
    });

    it('should merge with existing VS Code settings', async () => {
      // First, create existing settings
      const vscodeSettingsPath = path.join(process.cwd(), '.vscode', 'settings.json');
      await fs.ensureDir(path.dirname(vscodeSettingsPath));
      await fs.writeJson(vscodeSettingsPath, {
        'editor.formatOnSave': true,
        'typescript.preferences.includePackageJsonAutoImports': 'off',
      });

      // Run setup
      await mcpServer.setupEditor('vscode', {
        isGlobal: false,
      });

      // Verify that existing settings are preserved and MCP config is added
      const settings = await fs.readJson(vscodeSettingsPath);
      expect(settings).to.have.property('editor.formatOnSave', true);
      expect(settings).to.have.property('typescript.preferences.includePackageJsonAutoImports', 'off');
      expect(settings).to.have.property('mcp');
      expect(settings.mcp.servers['bit-cli']).to.deep.equal({
        command: 'bit',
        args: ['mcp-server'],
      });
    });
  });
});
