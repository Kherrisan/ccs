import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'events';
import { attachDisconnectAbortHandlers } from '../../../src/proxy/server/messages-route';

class FakeSocket extends EventEmitter {
  destroyed = false;
}

class FakeRequest extends EventEmitter {
  destroyed = false;
  socket = new FakeSocket();
}

class FakeResponse extends EventEmitter {
  destroyed = false;
  writableEnded = false;
  socket = new FakeSocket();
}

describe('attachDisconnectAbortHandlers', () => {
  it('cleans up registered listeners after the request completes', () => {
    const req = new FakeRequest();
    const res = new FakeResponse();
    const controller = new AbortController();

    const cleanup = attachDisconnectAbortHandlers(
      req as never,
      res as never,
      controller,
      () => {}
    );

    expect(req.listenerCount('aborted')).toBe(1);
    expect(req.listenerCount('close')).toBe(0);
    expect(req.socket.listenerCount('close')).toBe(1);
    expect(res.listenerCount('close')).toBe(0);
    expect(res.socket.listenerCount('close')).toBe(1);

    cleanup();

    expect(req.listenerCount('aborted')).toBe(0);
    expect(req.socket.listenerCount('close')).toBe(0);
    expect(res.socket.listenerCount('close')).toBe(0);
  });

  it('aborts at most once when disconnect signals race each other', () => {
    const req = new FakeRequest();
    const res = new FakeResponse();
    const controller = new AbortController();
    let disconnectCount = 0;

    const cleanup = attachDisconnectAbortHandlers(
      req as never,
      res as never,
      controller,
      () => {
        disconnectCount += 1;
      }
    );

    req.emit('aborted');
    req.socket.emit('close');
    res.socket.emit('close');

    expect(controller.signal.aborted).toBe(true);
    expect(disconnectCount).toBe(1);

    cleanup();
  });
});
