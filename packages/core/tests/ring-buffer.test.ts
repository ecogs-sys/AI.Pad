import { describe, expect, it } from 'vitest';
import { RingBuffer } from '../src/ring-buffer.js';

describe('RingBuffer', () => {
  it('stores writes below capacity and returns them via snapshot()', () => {
    const buf = new RingBuffer(64);
    buf.write(Buffer.from('hello'));
    buf.write(Buffer.from(' world'));
    expect(buf.snapshot().toString('utf8')).toBe('hello world');
  });

  it('drops the oldest bytes when total exceeds capacity', () => {
    const buf = new RingBuffer(8);
    buf.write(Buffer.from('abcdefgh')); // exactly capacity
    buf.write(Buffer.from('ij'));        // pushes ab out
    expect(buf.snapshot().toString('utf8')).toBe('cdefghij');
  });

  it('handles a single write larger than capacity (keeps the tail)', () => {
    const buf = new RingBuffer(4);
    buf.write(Buffer.from('abcdefgh'));
    expect(buf.snapshot().toString('utf8')).toBe('efgh');
  });

  it('tail(n) returns up to the last n bytes', () => {
    const buf = new RingBuffer(64);
    buf.write(Buffer.from('hello world'));
    expect(buf.tail(5).toString('utf8')).toBe('world');
    expect(buf.tail(100).toString('utf8')).toBe('hello world'); // saturates at content length
  });

  it('returns an empty buffer for snapshot() when no writes have occurred', () => {
    const buf = new RingBuffer(16);
    expect(buf.snapshot().length).toBe(0);
  });

  it('handles a write that straddles the physical storage boundary', () => {
    const buf = new RingBuffer(6);
    buf.write(Buffer.from('abcd')); // writeStart=0, fills [a,b,c,d,_,_], size=4
    buf.write(Buffer.from('efgh')); // writeStart=4, firstSpan=2 ('ef'), remaining 'gh' wraps to [0..1]
    // newSize=8>6, start=(0+2)%6=2 -> snapshot is storage[2..5]+storage[0..1] = 'cdef'+'gh'
    expect(buf.snapshot().toString('utf8')).toBe('cdefgh');
  });

  it('throws when constructed with a non-positive capacity', () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(-1)).toThrow();
  });
});
