import { expect } from 'chai';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { McpConfigWriter } from './mcp-config-writer';

const URL = 'https://mcp.bit.cloud/mcp';

describe('McpConfigWriter — Cloud MCP setup', () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-cloud-spec-'));
  });

  afterEach(async () => {
    await fs.remove(workspaceDir);
  });

  describe('setupCloudMcp dispatch', () => {
    it('throws for unsupported editor', async () => {
      let caught: Error | undefined;
      try {
        await McpConfigWriter.setupCloudMcp('emacs', workspaceDir);
      } catch (err: any) {
        caught = err;
      }
      expect(caught).to.exist;
      expect(caught!.message).to.include('not supported for Cloud MCP');
    });

    it('lowercases editor name', async () => {
      await McpConfigWriter.setupCloudMcp('Cursor', workspaceDir);
      expect(await fs.pathExists(path.join(workspaceDir, '.cursor', 'mcp.json'))).to.be.true;
    });
  });

  describe('JSON editors', () => {
    it('claude-code: writes .mcp.json with type=http entry under mcpServers', async () => {
      await McpConfigWriter.setupCloudMcp('claude-code', workspaceDir);
      const cfg = await fs.readJson(path.join(workspaceDir, '.mcp.json'));
      expect(cfg.mcpServers['bit-cloud']).to.eql({ type: 'http', url: URL });
    });

    it('cursor: writes .cursor/mcp.json with bare url entry under mcpServers', async () => {
      await McpConfigWriter.setupCloudMcp('cursor', workspaceDir);
      const cfg = await fs.readJson(path.join(workspaceDir, '.cursor', 'mcp.json'));
      expect(cfg.mcpServers['bit-cloud']).to.eql({ url: URL });
    });

    it('windsurf: writes .windsurf/mcp.json with serverUrl entry under mcpServers', async () => {
      await McpConfigWriter.setupCloudMcp('windsurf', workspaceDir);
      const cfg = await fs.readJson(path.join(workspaceDir, '.windsurf', 'mcp.json'));
      expect(cfg.mcpServers['bit-cloud']).to.eql({ serverUrl: URL });
    });

    it('copilot: writes .vscode/mcp.json with type=http entry under servers (singular key)', async () => {
      await McpConfigWriter.setupCloudMcp('copilot', workspaceDir);
      const cfg = await fs.readJson(path.join(workspaceDir, '.vscode', 'mcp.json'));
      expect(cfg.servers['bit-cloud']).to.eql({ type: 'http', url: URL });
    });

    it('preserves existing servers when merging', async () => {
      const cursorPath = path.join(workspaceDir, '.cursor', 'mcp.json');
      await fs.outputJson(cursorPath, { mcpServers: { 'other-server': { url: 'http://example.com' } } });
      await McpConfigWriter.setupCloudMcp('cursor', workspaceDir);
      const cfg = await fs.readJson(cursorPath);
      expect(cfg.mcpServers).to.have.keys('other-server', 'bit-cloud');
      expect(cfg.mcpServers['other-server']).to.eql({ url: 'http://example.com' });
    });
  });

  describe('buildCodexConfigUpdate', () => {
    it('returns a fresh block when given empty content', () => {
      const out = McpConfigWriter.buildCodexConfigUpdate('');
      expect(out).to.equal(`[mcp_servers.bit-cloud]\nurl = "${URL}"\n`);
    });

    it('appends with one newline separator when existing ends with newline', () => {
      const out = McpConfigWriter.buildCodexConfigUpdate('[other]\nfoo = "bar"\n');
      expect(out).to.equal(`[other]\nfoo = "bar"\n\n[mcp_servers.bit-cloud]\nurl = "${URL}"\n`);
    });

    it('appends with double-newline separator when existing has no trailing newline', () => {
      const out = McpConfigWriter.buildCodexConfigUpdate('[other]\nfoo = "bar"');
      expect(out).to.equal(`[other]\nfoo = "bar"\n\n[mcp_servers.bit-cloud]\nurl = "${URL}"\n`);
    });

    it('returns null (no-op) when the bare-key bit-cloud table is already present', () => {
      const existing = `[mcp_servers.bit-cloud]\nurl = "https://elsewhere"\n`;
      expect(McpConfigWriter.buildCodexConfigUpdate(existing)).to.be.null;
    });

    it('returns null (no-op) when the basic-string quoted-key bit-cloud table is already present', () => {
      const existing = `[mcp_servers."bit-cloud"]\nurl = "https://elsewhere"\n`;
      expect(McpConfigWriter.buildCodexConfigUpdate(existing)).to.be.null;
    });

    it('returns null (no-op) when the literal-string quoted-key bit-cloud table is already present', () => {
      const existing = `[mcp_servers.'bit-cloud']\nurl = "https://elsewhere"\n`;
      expect(McpConfigWriter.buildCodexConfigUpdate(existing)).to.be.null;
    });

    it('returns null (no-op) when the header has whitespace inside the brackets', () => {
      const existing = `[ mcp_servers.bit-cloud ]\nurl = "https://elsewhere"\n`;
      expect(McpConfigWriter.buildCodexConfigUpdate(existing)).to.be.null;
    });

    it('does NOT treat a substring inside a comment as an existing block', () => {
      const existing = `# this references [mcp_servers.bit-cloud] in passing\n`;
      const out = McpConfigWriter.buildCodexConfigUpdate(existing);
      expect(out).to.not.be.null;
      expect(out).to.include(`\n[mcp_servers.bit-cloud]\nurl = "${URL}"\n`);
    });
  });
});
