import chai, { expect } from 'chai';

import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

(supportNpmCiRegistryTesting ? describe : describe.skip)('repository-hooks-aspects', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('export to remote scope with aspect-based manipulation hooks', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();

      // Create the hooks aspect
      helper.command.create('bit-aspect', 'repository-hooks-aspect');
      // throw new Error('hi')

      // Create the hooks aspect implementation
      helper.fs.outputFile(
        `${helper.scopes.remoteWithoutOwner}/repository-hooks-aspect/repository-hooks-aspect.main.runtime.ts`,
        getRepositoryHooksAspectMainRuntime()
      );

      // Add aspect extension and compile the aspect
      helper.command.install();
      helper.command.tagAllComponents();
      helper.command.export();

      // Re-initialize workspace for testing
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();

      // Install the aspect and configure it in workspace.jsonc
      helper.command.install(`@ci/${helper.scopes.remoteWithoutOwner}.repository-hooks-aspect`);

      // Create a test component
      helper.fixtures.populateComponents(1, false);
      helper.command.use(`${helper.scopes.remote}/repository-hooks-aspect`);
    });
    after(() => {
      npmCiRegistry.destroy();
    });

    it('when tagging should run the on pre persist hook, then when loading, should run the on pre read hook', () => {
      const output = helper.command.tagAllComponents();
      expect(output).to.include('on persist run');
      expect(output).to.include('Encryption successful');

      const statusOutput = helper.command.status();
      expect(statusOutput).to.include('on read run');
      expect(statusOutput).to.include('Decryption successful');
    });
  });
});

function getRepositoryHooksAspectMainRuntime() {
  return `import * as crypto from 'crypto';
import { MainRuntime } from '@teambit/cli';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import { RepositoryHooksAspectAspect } from './repository-hooks-aspect.aspect';

export class RepositoryHooksAspectMain {
  static slots = [];
  static dependencies = [ScopeAspect];
  static runtime = MainRuntime;

  static async provider([scope]: [ScopeMain]) {
    console.log('RepositoryHooksAspectMain provider called');
    const repositoryHooksAspectMain = new RepositoryHooksAspectMain();

    // Register to the pre-object persist hook
    scope.registerOnPreObjectPersist((content: Buffer) => {
        console.log('on persist run');
        return encrypt(content);
    });

    // Register to the pre-object read hook
    scope.registerOnPostObjectRead((content: Buffer) => {
      console.log('on read run');
      return decrypt(content);
    });

    return repositoryHooksAspectMain;
  }
}

RepositoryHooksAspectAspect.addRuntime(RepositoryHooksAspectMain);

// Constants for encryption
const ENCRYPTION_MARKER = Buffer.from('BIT_ENCRYPTED_V1:', 'utf8');
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Simple key derivation for demo purposes - in production, use proper key management
const ENCRYPTION_KEY = crypto.scryptSync('bit-secret-key', 'bit-salt', KEY_LENGTH);

function encrypt(chunk: Buffer): Buffer {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(chunk), cipher.final()]);
    const tag = cipher.getAuthTag();

    console.log('Encryption successful');
    // Combine marker + iv + tag + encrypted data
    return Buffer.concat([ENCRYPTION_MARKER, iv, tag, encrypted]);
  } catch (error) {
    console.error('Encryption failed:', error);
    // Return original content if encryption fails
    return chunk;
  }
}

function decrypt(chunk: Buffer): Buffer {
  try {
    // Check if the content starts with our encryption marker
    if (!chunk.subarray(0, ENCRYPTION_MARKER.length).equals(ENCRYPTION_MARKER)) {
      // Not encrypted - return as is (backward compatibility)
      console.log('Decryption skipped: not encrypted');
      return chunk;
    }

    // Extract components
    let offset = ENCRYPTION_MARKER.length;
    const iv = chunk.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;

    const tag = chunk.subarray(offset, offset + TAG_LENGTH);
    offset += TAG_LENGTH;

    const encrypted = chunk.subarray(offset);

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);

    // Decrypt the data
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    console.log('Decryption successful');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    // If decryption fails, assume it's unencrypted content (backward compatibility)
    return chunk;
  }
}
`;
}
