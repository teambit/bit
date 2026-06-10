import { expect } from 'chai';

import { LaneHistory } from './lane-history';

const makeItem = (date: string) => ({
  log: { date, username: 'tester' },
  components: [],
});

describe('LaneHistory', () => {
  describe('getHistoryIds', () => {
    it('returns ids sorted by date even when insertion order is not chronological', () => {
      const laneHistory = LaneHistory.parse(
        JSON.stringify({
          name: 'tmp4',
          scope: 'my-scope',
          laneHash: 'abc',
          history: {
            'newer-local': makeItem('1746369091000'), // 5/4/2026, 12:51 PM
            'older-remote-1': makeItem('1746127977000'), // 5/1/2026, 3:32 PM
            'older-remote-2': makeItem('1746127986000'), // 5/1/2026, 3:33 PM
            'between-remote': makeItem('1746358729000'), // 5/4/2026, 9:58 AM
          },
        })
      );

      expect(laneHistory.getHistoryIds()).to.deep.equal([
        'older-remote-1',
        'older-remote-2',
        'between-remote',
        'newer-local',
      ]);
    });
  });
});
