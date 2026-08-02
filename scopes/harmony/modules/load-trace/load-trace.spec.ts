import { expect } from 'chai';
import { startOrJoinLoadTrace, loadSpan, currentLoadTrace, getLoadTraceLogPrefix } from './load-trace';

describe('load-trace', () => {
  it('should start a trace at the entry point and expose it to nested code', async () => {
    await startOrJoinLoadTrace('getMany', { ids: 2 }, async () => {
      const trace = currentLoadTrace();
      expect(trace).to.not.be.undefined;
      expect(trace?.rootSpan.name).to.equal('getMany');
    });
    expect(currentLoadTrace()).to.be.undefined;
  });

  it('should join an active trace instead of starting a new one', async () => {
    await startOrJoinLoadTrace('getMany', {}, async () => {
      const outerTraceId = currentLoadTrace()?.id;
      await startOrJoinLoadTrace('loadAspects', {}, async () => {
        expect(currentLoadTrace()?.id).to.equal(outerTraceId);
      });
    });
  });

  it('should give independent loads distinct trace ids', async () => {
    let firstId: string | undefined;
    let secondId: string | undefined;
    await startOrJoinLoadTrace('getMany', {}, async () => {
      firstId = currentLoadTrace()?.id;
    });
    await startOrJoinLoadTrace('getMany', {}, async () => {
      secondId = currentLoadTrace()?.id;
    });
    expect(firstId).to.not.be.undefined;
    expect(firstId).to.not.equal(secondId);
  });

  it('should record nested spans as a tree with durations', async () => {
    await startOrJoinLoadTrace('getMany', {}, async (root) => {
      await loadSpan('extension-merge', { component: 'ui/button' }, async () => {});
      await loadSpan('env-calc', {}, async (span) => {
        span.setAttribute('env', 'teambit.react/react');
      });
      expect(root.children.map((child) => child.name)).to.deep.equal(['extension-merge', 'env-calc']);
      expect(root.children[0].durationMs).to.be.a('number');
      expect(root.children[1].attributes.env).to.equal('teambit.react/react');
    });
  });

  it('should include trace id and span path in the log prefix', async () => {
    await startOrJoinLoadTrace('getMany', {}, async () => {
      const traceId = currentLoadTrace()?.id;
      await loadSpan('load-one', {}, async () => {
        expect(getLoadTraceLogPrefix()).to.equal(`[trace:${traceId} getMany > load-one] `);
      });
    });
    expect(getLoadTraceLogPrefix()).to.equal('');
  });

  it('should run the callback unchanged when no trace is active', async () => {
    const result = await loadSpan('orphan-stage', {}, async () => 'value');
    expect(result).to.equal('value');
    expect(currentLoadTrace()).to.be.undefined;
  });

  it('should propagate errors without swallowing and still end the span', async () => {
    let captured;
    try {
      await startOrJoinLoadTrace('getMany', {}, async (root) => {
        captured = root;
        throw new Error('load failed');
      });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.message).to.equal('load failed');
    }
    expect(captured.durationMs).to.be.a('number');
  });
});
