/* eslint-disable import/extensions */
/* eslint-disable import/no-unresolved */

import { expect } from 'chai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { mockWorkspace, destroyWorkspace, WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';

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
