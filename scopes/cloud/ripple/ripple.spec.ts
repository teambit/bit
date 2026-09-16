import { expect } from 'chai';
import type { CloudMain } from '@teambit/cloud';
import type { Logger } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { RippleMain, type RippleJob, type SimulateNetwork } from './ripple.main.runtime';
import { RippleSimulateCmd } from './ripple.cmd';

const LANE_ID = 'org.scope/my-lane';
const JOB: RippleJob = {
  id: 'job-1',
  slug: 'job-1-slug',
  laneId: LANE_ID,
  simulation: true,
  status: { phase: 'PENDING' },
};

function createRippleMain(
  opts: { token?: string | null; currentLaneId?: string; isLaneExported?: boolean } = {}
): RippleMain {
  const token = opts.token === undefined ? 'test-token' : opts.token;
  const cloud = {
    getAuthToken: () => token,
    getCloudApi: () => 'https://api.test.local',
    getAuthHeader: () => ({ Authorization: `Bearer ${token}` }),
  } as unknown as CloudMain;
  const logger = { debug: () => undefined, warn: () => undefined, error: () => undefined } as unknown as Logger;
  const workspace = opts.currentLaneId
    ? ({
        getCurrentLaneId: () => ({ isDefault: () => false, toString: () => opts.currentLaneId }),
        consumer: { bitMap: { isLaneExported: opts.isLaneExported ?? true } },
      } as unknown as Workspace)
    : undefined;
  return new RippleMain(cloud, logger, workspace);
}

describe('RippleMain.simulateLane()', () => {
  let realFetch: typeof fetch;
  let requests: Array<{ url: string; headers: Record<string, string>; body: any }>;
  let responseBody: Record<string, any>;

  beforeEach(() => {
    realFetch = globalThis.fetch;
    requests = [];
    responseBody = { data: { simulateLane: JOB } };
    globalThis.fetch = (async (url: any, init: any) => {
      requests.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('should send the simulateLane mutation with the lane id and the auth header', async () => {
    const ripple = createRippleMain();
    const job = await ripple.simulateLane(LANE_ID);
    expect(job).to.deep.equal(JOB);
    expect(requests).to.have.lengthOf(1);
    const [request] = requests;
    expect(request.url).to.equal('https://api.test.local/graphql');
    expect(request.headers.Authorization).to.equal('Bearer test-token');
    expect(request.body.query).to.match(/^\s*mutation simulateLane\(/);
    expect(request.body.query).to.include('simulateLane(laneId: $laneId, options: $options)');
    expect(request.body.variables.laneId).to.equal(LANE_ID);
  });

  it('should omit options when no network filter is given, so the server default applies', async () => {
    const ripple = createRippleMain();
    await ripple.simulateLane(LANE_ID);
    expect(requests[0].body.variables).to.not.have.property('options');

    await ripple.simulateLane(LANE_ID, { scopeIds: undefined, ownerIds: [], excludeScopeIds: undefined });
    expect(requests[1].body.variables).to.not.have.property('options');
  });

  it('should pass the network filter as options.network', async () => {
    const ripple = createRippleMain();
    await ripple.simulateLane(LANE_ID, { scopeIds: ['org.a'], excludeScopeIds: ['org.b'] });
    expect(requests[0].body.variables.options).to.deep.equal({
      network: { scopeIds: ['org.a'], excludeScopeIds: ['org.b'] },
    });
  });

  it('should throw when not logged in, without calling the API', async () => {
    const ripple = createRippleMain({ token: null });
    const error: Error = await ripple.simulateLane(LANE_ID).catch((err) => err);
    expect(error.message).to.include('not logged in');
    expect(requests).to.have.lengthOf(0);
  });

  it('should surface GraphQL errors', async () => {
    responseBody = { errors: [{ message: 'lane not found' }] };
    const ripple = createRippleMain();
    const error: Error = await ripple.simulateLane(LANE_ID).catch((err) => err);
    expect(error.message).to.include('lane not found');
  });
});

describe('RippleSimulateCmd', () => {
  type SimulateCall = { laneId: string; network?: SimulateNetwork };

  function createCmd(opts: { currentLaneId?: string; isLaneExported?: boolean } = {}) {
    const calls: SimulateCall[] = [];
    const ripple = {
      getCurrentLaneId: () => opts.currentLaneId,
      isCurrentLaneExported: () => (opts.currentLaneId ? (opts.isLaneExported ?? true) : undefined),
      simulateLane: async (laneId: string, network?: SimulateNetwork) => {
        calls.push({ laneId, network });
        return JOB;
      },
      getJobUrl: (job: RippleJob) => `https://bit.test/ripple-ci/job/${job.slug}`,
    } as unknown as RippleMain;
    return { cmd: new RippleSimulateCmd(ripple), calls };
  }

  it('should fail when not on a lane and no --lane is given', async () => {
    const { cmd, calls } = createCmd();
    const error: Error = await cmd.json([], {}).catch((err) => err);
    expect(error.message).to.include('requires a lane');
    expect(calls).to.have.lengthOf(0);
  });

  it('should refuse to simulate the current lane when it was never exported', async () => {
    const { cmd, calls } = createCmd({ currentLaneId: LANE_ID, isLaneExported: false });
    const error: Error = await cmd.json([], {}).catch((err) => err);
    expect(error.message).to.include('never exported');
    expect(calls).to.have.lengthOf(0);
  });

  it('should simulate the current lane by default', async () => {
    const { cmd, calls } = createCmd({ currentLaneId: LANE_ID });
    const result = await cmd.json([], {});
    expect(calls.map((call) => call.laneId)).to.deep.equal([LANE_ID]);
    expect(result).to.deep.equal({ laneId: LANE_ID, job: JOB, url: 'https://bit.test/ripple-ci/job/job-1-slug' });
  });

  it('should prefer --lane over the current lane and not apply the exported check to it', async () => {
    const { cmd, calls } = createCmd({ currentLaneId: LANE_ID, isLaneExported: false });
    await cmd.json([], { lane: 'org.scope/other-lane' });
    expect(calls.map((call) => call.laneId)).to.deep.equal(['org.scope/other-lane']);
  });

  it('should split the comma-separated network flags and drop empty entries', async () => {
    const { cmd, calls } = createCmd({ currentLaneId: LANE_ID });
    await cmd.json([], { scopes: 'org.a, org.b,', owners: '', excludeScopes: 'org.c' });
    expect(calls[0].network).to.deep.equal({
      scopeIds: ['org.a', 'org.b'],
      ownerIds: undefined,
      excludeScopeIds: ['org.c'],
    });
  });

  it('should report the job id, the url and the follow-up command', async () => {
    const { cmd } = createCmd({ currentLaneId: LANE_ID });
    const output = await cmd.report([], {});
    expect(output).to.include(LANE_ID);
    expect(output).to.include('job-1');
    expect(output).to.include('https://bit.test/ripple-ci/job/job-1-slug');
    expect(output).to.include('bit ripple log job-1');
  });
});
