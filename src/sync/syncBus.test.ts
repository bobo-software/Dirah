import { describe, expect, it } from 'vitest';
import { createMemoryHub } from './syncBus';

describe('sync memory hub', () => {
  it('delivers publishes to other origins only', () => {
    const hub = createMemoryHub();
    const a = hub.connect();
    const b = hub.connect();
    const seen: Array<{ docId: string; n: number }> = [];
    const stop = b.onRemote((docId, payload) => {
      seen.push({ docId, n: payload.n as number });
    });
    a.publish('doc-1', { type: 'update', n: 7 });
    a.publish('doc-1', { type: 'update', n: 8 });
    expect(seen).toEqual([
      { docId: 'doc-1', n: 7 },
      { docId: 'doc-1', n: 8 },
    ]);
    seen.length = 0;
    a.publish('doc-1', { type: 'update', n: 9 });
    stop();
    a.publish('doc-1', { type: 'update', n: 10 });
    expect(seen).toEqual([{ docId: 'doc-1', n: 9 }]);
  });
});
