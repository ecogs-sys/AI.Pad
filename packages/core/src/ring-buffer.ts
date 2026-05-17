/**
 * Fixed-capacity byte ring buffer. Writes that overflow drop the oldest bytes.
 * Internal representation is a single contiguous Buffer to keep snapshot() cheap.
 * UTF-8 boundary safety is the caller's concern (we operate on raw bytes).
 */
export class RingBuffer {
  private readonly capacity: number;
  private readonly storage: Buffer;
  private size = 0; // number of valid bytes in storage, always <= capacity
  private start = 0; // index of the oldest byte within storage

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`RingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.storage = Buffer.alloc(capacity);
  }

  write(chunk: Buffer): void {
    if (chunk.length === 0) return;

    // Fast path: single write larger than capacity -> keep only the tail.
    if (chunk.length >= this.capacity) {
      const tail = chunk.subarray(chunk.length - this.capacity);
      tail.copy(this.storage, 0);
      this.size = this.capacity;
      this.start = 0;
      return;
    }

    // Write into a linear "virtual" position (start + size) modulo capacity.
    const writeStart = (this.start + this.size) % this.capacity;
    const firstSpan = Math.min(chunk.length, this.capacity - writeStart);
    chunk.copy(this.storage, writeStart, 0, firstSpan);
    const remaining = chunk.length - firstSpan;
    if (remaining > 0) {
      chunk.copy(this.storage, 0, firstSpan);
    }

    const newSize = this.size + chunk.length;
    if (newSize <= this.capacity) {
      this.size = newSize;
    } else {
      this.size = this.capacity;
      this.start = (this.start + (newSize - this.capacity)) % this.capacity;
    }
  }

  snapshot(): Buffer {
    if (this.size === 0) return Buffer.alloc(0);
    const out = Buffer.alloc(this.size);
    const firstSpan = Math.min(this.size, this.capacity - this.start);
    this.storage.copy(out, 0, this.start, this.start + firstSpan);
    const remaining = this.size - firstSpan;
    if (remaining > 0) {
      this.storage.copy(out, firstSpan, 0, remaining);
    }
    return out;
  }

  tail(n: number): Buffer {
    if (n <= 0) return Buffer.alloc(0);
    const want = Math.min(n, this.size);
    const snap = this.snapshot();
    return snap.subarray(snap.length - want);
  }
}
