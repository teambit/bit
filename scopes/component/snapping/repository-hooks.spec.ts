import { expect } from 'chai';
import crypto from 'crypto';
import { loadManyAspects } from '@teambit/harmony.testing.load-aspect';
import type { WorkspaceData } from '@teambit/workspace.testing.mock-workspace';
import { mockWorkspace, destroyWorkspace } from '@teambit/workspace.testing.mock-workspace';
import { mockComponents } from '@teambit/component.testing.mock-components';
import { WorkspaceAspect } from '@teambit/workspace';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { ComponentID } from '@teambit/component-id';
import type { SnappingMain } from './snapping.main.runtime';
import { SnappingAspect } from './snapping.aspect';

const ENCRYPTION_MARKER = Buffer.from('BIT_ENCRYPTED_V1:');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const ENCRYPTION_KEY = crypto.scryptSync('bit-secret-key', 'bit-salt', 32);

function encrypt(chunk: Buffer, log: string[]): Buffer {
  log.push('Encryption successful');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(chunk), cipher.final()]);
  return Buffer.concat([ENCRYPTION_MARKER, iv, cipher.getAuthTag(), encrypted]);
}

function decrypt(chunk: Buffer, log: string[]): Buffer {
  if (!chunk.subarray(0, ENCRYPTION_MARKER.length).equals(ENCRYPTION_MARKER)) return chunk;
  let offset = ENCRYPTION_MARKER.length;
  const iv = chunk.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const tag = chunk.subarray(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH;
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(chunk.subarray(offset)), decipher.final()]);
  log.push('Decryption successful');
  return decrypted;
}

/**
 * an aspect that registers to the scope's pre-persist and post-read hooks (e.g. to encrypt the objects).
 * it lives here since tagging needs this aspect, and the scope aspect must not depend on it.
 */
describe('repository hooks registered by an aspect', function () {
  this.timeout(0);

  let workspaceData: WorkspaceData;
  let persistLog: string[];
  let readLog: string[];
  const registerHooks = (scope: ScopeMain) => {
    scope.registerOnPreObjectPersist((content) => {
      persistLog.push('on persist run');
      return encrypt(content, persistLog);
    });
    scope.registerOnPostObjectRead((content) => {
      readLog.push('on read run');
      return decrypt(content, readLog);
    });
  };

  let componentId: ComponentID;
  before(async () => {
    persistLog = [];
    readLog = [];
    workspaceData = mockWorkspace();
    [{ id: componentId }] = await mockComponents(workspaceData.workspacePath);
  });
  after(async () => {
    await destroyWorkspace(workspaceData);
  });

  it('when tagging should run the on pre persist hook, then when loading, should run the on pre read hook', async () => {
    const { workspacePath } = workspaceData;
    const taggingHarmony = await loadManyAspects([WorkspaceAspect, SnappingAspect, ScopeAspect], workspacePath);
    registerHooks(taggingHarmony.get<ScopeMain>(ScopeAspect.id));
    await taggingHarmony.get<SnappingMain>(SnappingAspect.id).tag({ build: false, version: '0.0.1' });
    expect(persistLog).to.include('on persist run');
    expect(persistLog).to.include('Encryption successful');

    // a fresh process: the hooks are registered by the aspect when it loads, then the objects are read
    const loadingHarmony = await loadManyAspects([WorkspaceAspect, SnappingAspect, ScopeAspect], workspacePath);
    const scope = loadingHarmony.get<ScopeMain>(ScopeAspect.id);
    registerHooks(scope);
    await scope.legacyScope.getModelComponent(componentId);
    expect(readLog).to.include('on read run');
    expect(readLog).to.include('Decryption successful');
  });
});
