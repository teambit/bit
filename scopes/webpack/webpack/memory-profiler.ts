import { writeFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@teambit/logger';
import v8 from 'v8';

export class MemoryProfiler {
  private snapshotCounter = 0;
  private outputDir: string;

  constructor(
    private logger: Logger,
    outputDir = process.cwd()
  ) {
    this.outputDir = outputDir;
  }

  /**
   * Generate a heap snapshot file that can be analyzed with Chrome DevTools
   */
  takeHeapSnapshot(label: string): string {
    try {
      const filename = `heap-snapshot-${label}-${Date.now()}-${++this.snapshotCounter}.heapsnapshot`;
      const filepath = join(this.outputDir, filename);

      this.logger.console(`📸 Taking heap snapshot: ${filename}`);

      const snapshot = v8.writeHeapSnapshot(filepath);
      this.logger.console(`✅ Heap snapshot saved: ${snapshot}`);

      return snapshot;
    } catch (error) {
      this.logger.error('Failed to take heap snapshot:', error);
      return '';
    }
  }

  /**
   * Get detailed memory usage breakdown
   */
  getMemoryUsageDetails(): any {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const heapSpaceStats = v8.getHeapSpaceStatistics();

    const formatBytes = (bytes: number) => {
      const gb = bytes / (1024 * 1024 * 1024);
      const mb = bytes / (1024 * 1024);
      return gb > 1 ? `${gb.toFixed(2)}GB` : `${mb.toFixed(2)}MB`;
    };

    return {
      timestamp: new Date().toISOString(),
      processMemory: {
        rss: formatBytes(memUsage.rss), // Resident Set Size
        heapTotal: formatBytes(memUsage.heapTotal),
        heapUsed: formatBytes(memUsage.heapUsed),
        external: formatBytes(memUsage.external), // C++ objects bound to JS objects
        arrayBuffers: formatBytes(memUsage.arrayBuffers),
      },
      v8HeapStats: {
        totalHeapSize: formatBytes(heapStats.total_heap_size),
        totalHeapSizeExecutable: formatBytes(heapStats.total_heap_size_executable),
        totalPhysicalSize: formatBytes(heapStats.total_physical_size),
        totalAvailableSize: formatBytes(heapStats.total_available_size),
        usedHeapSize: formatBytes(heapStats.used_heap_size),
        heapSizeLimit: formatBytes(heapStats.heap_size_limit),
        mallocedMemory: formatBytes(heapStats.malloced_memory),
        externalMemory: formatBytes(heapStats.external_memory),
        peakMallocedMemory: formatBytes(heapStats.peak_malloced_memory),
        numberOfNativeContexts: heapStats.number_of_native_contexts,
        numberOfDetachedContexts: heapStats.number_of_detached_contexts,
      },
      heapSpaces: heapSpaceStats.map((space) => ({
        spaceName: space.space_name,
        spaceSize: formatBytes(space.space_size),
        spaceUsedSize: formatBytes(space.space_used_size),
        spaceAvailableSize: formatBytes(space.space_available_size),
        physicalSpaceSize: formatBytes(space.physical_space_size),
      })),
    };
  }

  /**
   * Log and save detailed memory analysis
   */
  analyzeMemoryUsage(label: string, saveToFile = true): void {
    const details = this.getMemoryUsageDetails();

    this.logger.console(`\n🔍 Memory Analysis (${label}):`);
    this.logger.console(
      `RSS: ${details.processMemory.rss}, Heap Used: ${details.processMemory.heapUsed}/${details.processMemory.heapTotal}`
    );
    this.logger.console(
      `V8 Heap: ${details.v8HeapStats.usedHeapSize}/${details.v8HeapStats.totalHeapSize} (Limit: ${details.v8HeapStats.heapSizeLimit})`
    );
    this.logger.console(`External Memory: ${details.processMemory.external} + ${details.v8HeapStats.externalMemory}`);
    this.logger.console(
      `Contexts: ${details.v8HeapStats.numberOfNativeContexts} native, ${details.v8HeapStats.numberOfDetachedContexts} detached`
    );

    // Log heap spaces that are using significant memory
    const significantSpaces = details.heapSpaces.filter(
      (space) => parseInt(space.spaceUsedSize) > 100 // > 100MB
    );
    if (significantSpaces.length > 0) {
      this.logger.console('Large heap spaces:');
      significantSpaces.forEach((space) => {
        this.logger.console(`  ${space.spaceName}: ${space.spaceUsedSize}/${space.spaceSize}`);
      });
    }

    if (saveToFile) {
      try {
        const filename = `memory-analysis-${label}-${Date.now()}.json`;
        const filepath = join(this.outputDir, filename);
        writeFileSync(filepath, JSON.stringify(details, null, 2));
        this.logger.console(`💾 Memory analysis saved: ${filename}`);
      } catch (error) {
        this.logger.error('Failed to save memory analysis:', error);
      }
    }
  }

  /**
   * Force garbage collection if --expose-gc flag is available
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      this.logger.debug('🗑️  Running garbage collection...');
      global.gc();
      this.logger.debug('✅ Garbage collection completed');
    } else {
      this.logger.debug('⚠️  Garbage collection not available (run with --expose-gc to enable)');
    }
  }

  /**
   * Check if memory usage is approaching dangerous levels
   */
  checkMemoryPressure(): { isHigh: boolean; usagePercent: number; recommendation: string } {
    const heapStats = v8.getHeapStatistics();
    const usagePercent = (heapStats.used_heap_size / heapStats.heap_size_limit) * 100;

    let recommendation = '';
    let isHigh = false;

    if (usagePercent > 85) {
      isHigh = true;
      recommendation = 'CRITICAL: Memory usage > 85%, consider reducing workload or increasing heap limit';
    } else if (usagePercent > 70) {
      isHigh = true;
      recommendation = 'HIGH: Memory usage > 70%, monitor closely and consider optimizations';
    } else if (usagePercent > 50) {
      recommendation = 'MODERATE: Memory usage > 50%, within acceptable range but worth monitoring';
    } else {
      recommendation = 'LOW: Memory usage is healthy';
    }

    return { isHigh, usagePercent: Math.round(usagePercent), recommendation };
  }
}
