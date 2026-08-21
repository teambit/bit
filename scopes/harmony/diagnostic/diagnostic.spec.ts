import os from 'os';
import { expect } from 'chai';
import { DiagnosticMain } from './diagnostic.main.runtime';

describe('DiagnosticMain', () => {
  describe('getBitVersion', () => {
    it('should return an object with a version string', () => {
      const result = DiagnosticMain.getBitVersion();
      expect(result).to.have.property('version');
      expect(result.version).to.be.a('string');
    });
  });

  describe('getProcessInfo', () => {
    it('should return process uptime as a positive number', () => {
      const result = DiagnosticMain.getProcessInfo();
      expect(result.uptime).to.be.a('number');
      expect(result.uptime).to.be.greaterThan(0);
    });

    it('should return the current process pid', () => {
      const result = DiagnosticMain.getProcessInfo();
      expect(result.pid).to.equal(process.pid);
    });

    it('should return node version, platform, and arch', () => {
      const result = DiagnosticMain.getProcessInfo();
      expect(result.nodeVersion).to.equal(process.version);
      expect(result.platform).to.equal(process.platform);
      expect(result.arch).to.equal(process.arch);
    });

    it('should return memory usage with all expected fields', () => {
      const result = DiagnosticMain.getProcessInfo();
      expect(result.memory).to.have.property('rss').that.is.a('number');
      expect(result.memory).to.have.property('heapTotal').that.is.a('number');
      expect(result.memory).to.have.property('heapUsed').that.is.a('number');
      expect(result.memory).to.have.property('external').that.is.a('number');
      expect(result.memory).to.have.property('arrayBuffers').that.is.a('number');
    });

    it('should return memory values that are positive', () => {
      const result = DiagnosticMain.getProcessInfo();
      expect(result.memory.rss).to.be.greaterThan(0);
      expect(result.memory.heapTotal).to.be.greaterThan(0);
      expect(result.memory.heapUsed).to.be.greaterThan(0);
    });

    it('should return cpu usage with user and system fields', () => {
      const result = DiagnosticMain.getProcessInfo();
      expect(result.cpu).to.have.property('user').that.is.a('number');
      expect(result.cpu).to.have.property('system').that.is.a('number');
    });

    it('should return system info matching os module values', () => {
      const result = DiagnosticMain.getProcessInfo();
      expect(result.system.totalMemory).to.equal(os.totalmem());
      expect(result.system.cpuCount).to.equal(os.cpus().length);
      expect(result.system.hostname).to.equal(os.hostname());
    });

    it('should return load average as an array of 3 numbers', () => {
      const result = DiagnosticMain.getProcessInfo();
      expect(result.system.loadAverage).to.be.an('array').with.lengthOf(3);
      result.system.loadAverage.forEach((val) => {
        expect(val).to.be.a('number');
      });
    });

    it('should return free memory less than or equal to total memory', () => {
      const result = DiagnosticMain.getProcessInfo();
      expect(result.system.freeMemory).to.be.at.most(result.system.totalMemory);
      expect(result.system.freeMemory).to.be.greaterThan(0);
    });
  });
});
