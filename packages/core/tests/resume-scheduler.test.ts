import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeScheduler } from '../src/resume-scheduler.js';

describe('ResumeScheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires onDue once the reset time plus grace has passed', () => {
    const fired: string[] = [];
    const s = new ResumeScheduler({
      onDue: (id) => fired.push(id),
      sweepIntervalMs: 1_000,
      graceMs: 100,
    });
    s.schedule('sess-1', Date.now() + 5_000);
    vi.advanceTimersByTime(5_050); // past resetAt, not yet past grace
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(1_000); // crosses resetAt + grace
    expect(fired).toEqual(['sess-1']);
    expect(s.has('sess-1')).toBe(false);
  });

  it('ignores a second schedule for the same session (dedup)', () => {
    const s = new ResumeScheduler({ onDue: () => {}, sweepIntervalMs: 1_000, graceMs: 0 });
    expect(s.schedule('sess-1', Date.now() + 1_000)).toBe(true);
    expect(s.schedule('sess-1', Date.now() + 9_000)).toBe(false);
  });

  it('does not fire a cancelled resume', () => {
    const fired: string[] = [];
    const s = new ResumeScheduler({
      onDue: (id) => fired.push(id),
      sweepIntervalMs: 1_000,
      graceMs: 0,
    });
    s.schedule('sess-1', Date.now() + 2_000);
    expect(s.cancel('sess-1')).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(fired).toEqual([]);
  });

  it('cancelAll returns the cancelled session ids', () => {
    const s = new ResumeScheduler({ onDue: () => {}, sweepIntervalMs: 1_000, graceMs: 0 });
    s.schedule('a', Date.now() + 1_000);
    s.schedule('b', Date.now() + 1_000);
    expect(s.cancelAll().sort()).toEqual(['a', 'b']);
    expect(s.has('a')).toBe(false);
  });

  it('stops sweeping after dispose', () => {
    const fired: string[] = [];
    const s = new ResumeScheduler({
      onDue: (id) => fired.push(id),
      sweepIntervalMs: 1_000,
      graceMs: 0,
    });
    s.schedule('sess-1', Date.now() + 1_000);
    s.dispose();
    vi.advanceTimersByTime(10_000);
    expect(fired).toEqual([]);
  });
});
