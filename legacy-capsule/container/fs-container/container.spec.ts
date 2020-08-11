const mock = require('mock-fs');
import chai, { expect } from 'chai';
import * as path from 'path';
import FsContainer from './container';

chai.use(require('chai-fs'));

describe('FsContainer', () => {
  describe('start()', () => {
    describe('creating an instance without any path', () => {
      let container: FsContainer;
      before(async () => {
        mock({});
        container = new FsContainer();
        container.start();
      });
      after(() => {
        mock.restore();
      });
      it('should create the fs directory', () => {
        expect(container.getPath()).to.be.a.path();
      });
    });
    describe('creating an instance with a specific path', () => {
      let container: FsContainer;
      before(async () => {
        mock({});
        container = new FsContainer('custom-path');
        container.start();
      });
      after(() => {
        mock.restore();
      });
      it('directory path should be the specified path', () => {
        expect(container.getPath()).to.equal('custom-path');
      });
      it('should create the fs directory', () => {
        expect(container.getPath()).to.be.a.path();
      });
    });
  });
  describe('stop()', () => {
    let container: FsContainer;
    before(async () => {
      mock({});
      container = new FsContainer();
      await container.start();
      expect(container.getPath()).to.be.a.path();
      await container.stop();
    });
    after(() => {
      mock.restore();
    });
    it('should delete the container directory', () => {
      expect(container.getPath()).to.not.be.a.path();
    });
  });
  // @todo: exec doesn't work with mockFs :(
  describe('exec()', () => {
    let container: FsContainer;
    before(async () => {
      container = new FsContainer();
      await container.start();
      expect(container.getPath()).to.be.a.path();
    });
    after(async () => {
      await container.stop();
    });
    it('should return stdout', async () => {
      const execResults = await container.exec({ command: ['pwd'] });
      expect(execResults).to.have.property('stdout');
    });
    it('should run on the capsule directory', async () => {
      const execResults = await container.exec({ command: ['pwd'] });
      let output = '';
      execResults.stdout.on('data', (data: string) => {
        output += data;
      });
      execResults.stdout.on('error', (error: string) => {
        console.log('on error', error);
      });
      // @ts-ignore
      execResults.on('close', () => {
        // a hack for Mac, which randomly name the dir as '/private/var/folders' or '/var/folders'
        const dirResult = output.replace('/private/var/folders', '/var/folders').replace('\n', '');
        expect(dirResult).to.equal(container.getPath());
      });
    });
    it('should return stderr', async () => {
      const execResults = await container.exec({ command: ['pwd'] });
      expect(execResults).to.have.property('stderr');
    });
    it('should return stdin', async () => {
      const execResults = await container.exec({ command: ['pwd'] });
      expect(execResults).to.have.property('stdin');
    });
    it('should have abort method', async () => {
      const execResults = await container.exec({ command: ['pwd'] });
      expect(execResults).to.have.property('abort');
    });
    it('should have inspect method', async () => {
      const execResults = await container.exec({ command: ['pwd'] });
      expect(execResults).to.have.property('inspect');
    });
    it('inspect() should return the pid and the running status', async () => {
      const execResults = await container.exec({ command: ['pwd'] });
      const status = await execResults.inspect();
      expect(status).to.have.property('pid');
      expect(status).to.have.property('running');
    });
  });
  describe('put()', () => {
    let container: FsContainer;
    before(async () => {
      mock({});
      container = new FsContainer();
      await container.start();
      await container.put({ 'a.txt': 'hello' }, { path: 'foo' });
    });
    after(() => {
      mock.restore();
    });
    it('should create the file on the filesystem', () => {
      expect(path.join(container.getPath(), 'foo', 'a.txt')).to.be.a.file();
    });
  });
  describe('get()', () => {
    let container: FsContainer;
    let getResults: any;
    before(async () => {
      mock({});
      container = new FsContainer();
      await container.start();
      await container.put({ 'a.txt': 'hello' }, { path: 'foo' });
      getResults = await container.get({ path: path.join('foo', 'a.txt') });
    });
    after(() => {
      mock.restore();
    });
    it('should return a stream result', () => {
      let endResult: string = '';
      getResults.on('data', (chunk: string) => {
        endResult += chunk;
      });
      getResults.on('end', () => {
        expect(endResult).to.equal('hello');
      });
    });
  });
  describe('other container interface methods', () => {
    let container: FsContainer;
    before(async () => {
      mock({});
      container = new FsContainer();
      await container.start();
    });
    after(() => {
      mock.restore();
    });
    it('"inspect" method should be implemented', () => {
      expect(container.inspect).to.not.throw();
    });
    it('"pause" method should be implemented', () => {
      expect(container.pause).to.not.throw();
    });
    it('"resume" method should be implemented', () => {
      expect(container.resume).to.not.throw();
    });
  });
});
