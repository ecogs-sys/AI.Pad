import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationService, type FakeNotification, type FakeNotificationCtor } from '../src/notification-service.js';

function makeFakeCtor(): { ctor: FakeNotificationCtor; built: FakeNotification[] } {
  const built: FakeNotification[] = [];
  class Fake implements FakeNotification {
    title: string;
    body: string;
    private clickHandlers: Array<() => void> = [];

    constructor(opts: { title: string; body: string }) {
      this.title = opts.title;
      this.body = opts.body;
      built.push(this);
    }

    show(): void { /* no-op */ }

    on(event: string, handler: () => void): void {
      if (event === 'click') this.clickHandlers.push(handler);
    }

    triggerClick(): void {
      for (const h of this.clickHandlers) h();
    }
  }
  return { ctor: Fake as unknown as FakeNotificationCtor, built };
}

describe('NotificationService', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows a notification when notify() is called the first time', () => {
    const { ctor, built } = makeFakeCtor();
    const svc = new NotificationService(ctor);
    svc.notify({ sessionId: 'a', title: 'T', body: 'B' });
    expect(built).toHaveLength(1);
    expect(built[0]?.title).toBe('T');
    expect(built[0]?.body).toBe('B');
  });

  it('coalesces a second notify for the same sessionId within 30s', () => {
    const { ctor, built } = makeFakeCtor();
    const svc = new NotificationService(ctor);
    svc.notify({ sessionId: 'a', title: 'First', body: 'b' });
    svc.notify({ sessionId: 'a', title: 'Second', body: 'b' });
    expect(built).toHaveLength(1);
    expect(built[0]?.title).toBe('First');
  });

  it('allows a fresh notify for the same sessionId after 30s', () => {
    const { ctor, built } = makeFakeCtor();
    const svc = new NotificationService(ctor);
    svc.notify({ sessionId: 'a', title: 'First', body: 'b' });
    vi.advanceTimersByTime(31_000);
    svc.notify({ sessionId: 'a', title: 'Second', body: 'b' });
    expect(built).toHaveLength(2);
    expect(built[1]?.title).toBe('Second');
  });

  it('treats different sessionIds independently', () => {
    const { ctor, built } = makeFakeCtor();
    const svc = new NotificationService(ctor);
    svc.notify({ sessionId: 'a', title: 'A', body: 'b' });
    svc.notify({ sessionId: 'b', title: 'B', body: 'b' });
    expect(built).toHaveLength(2);
  });

  it('calls the onClick callback with the sessionId when the notification is clicked', () => {
    const { ctor, built } = makeFakeCtor();
    const clicked: string[] = [];
    const svc = new NotificationService(ctor);
    svc.onClick((sessionId) => clicked.push(sessionId));
    svc.notify({ sessionId: 'xyz', title: 'T', body: 'b' });
    built[0]?.triggerClick();
    expect(clicked).toEqual(['xyz']);
  });

  it('supports a custom coalesce window via constructor option', () => {
    const { ctor, built } = makeFakeCtor();
    const svc = new NotificationService(ctor, { coalesceMs: 5_000 });
    svc.notify({ sessionId: 'a', title: 'First', body: 'b' });
    vi.advanceTimersByTime(6_000);
    svc.notify({ sessionId: 'a', title: 'Second', body: 'b' });
    expect(built).toHaveLength(2);
  });
});
