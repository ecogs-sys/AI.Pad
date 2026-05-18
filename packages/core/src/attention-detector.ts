import { EventEmitter } from 'node:events';
import type { AttentionEvent, AttentionSignal } from '@aipad/contracts';

const BEL = 0x07;
const OSC_PREFIX = Buffer.from('\x1b]1337;AIPadAttention=', 'utf8');
const PAYLOAD_MAX = 1024;

export interface AttentionDetectorEvents {
  attention: (ev: AttentionEvent) => void;
}

/**
 * Byte-stream scanner that emits attention events for terminal BEL (\x07) and the AI.Pad
 * OSC escape (\x1b]1337;AIPadAttention=...\x07). Idle-prompt detection is deferred to Plan 3.
 *
 * State machine: outside-OSC vs. inside-OSC. BEL inside OSC is the terminator, NOT a bell event.
 * Prefix matching tolerates chunk boundaries (one byte at a time is fine).
 */
export class AttentionDetector extends EventEmitter {
  private inOsc = false;
  private oscPayload = '';
  private prefixMatchPos = 0;

  process(chunk: Buffer): void {
    if (chunk.length === 0) return;

    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i]!;

      if (this.inOsc) {
        if (byte === BEL) {
          this.emitEvent('osc', 1, this.oscPayload);
          this.oscPayload = '';
          this.inOsc = false;
        } else if (this.oscPayload.length < PAYLOAD_MAX) {
          this.oscPayload += String.fromCharCode(byte);
        }
        continue;
      }

      // Outside OSC — try to extend an in-progress prefix match.
      if (byte === OSC_PREFIX[this.prefixMatchPos]) {
        this.prefixMatchPos++;
        if (this.prefixMatchPos === OSC_PREFIX.length) {
          this.inOsc = true;
          this.prefixMatchPos = 0;
        }
        continue;
      }

      // Mismatch: reset prefix progress. The mismatching byte still needs processing
      // (could itself be a plain BEL or the start of a fresh prefix).
      if (this.prefixMatchPos > 0) {
        this.prefixMatchPos = 0;
        // Re-process this byte from scratch.
        i--;
        continue;
      }

      if (byte === BEL) {
        this.emitEvent('bell', 1);
      }
    }
  }

  private emitEvent(signal: AttentionSignal, confidence: number, snippet?: string): void {
    const ev: AttentionEvent = {
      sessionId: '__pending__', // Caller (Session) rewrites this with the actual id.
      signal,
      confidence,
      timestamp: Date.now(),
      ...(snippet !== undefined ? { snippet } : {}),
    };
    this.emit('attention', ev);
  }
}

export interface AttentionDetector {
  on<K extends keyof AttentionDetectorEvents>(event: K, listener: AttentionDetectorEvents[K]): this;
  emit<K extends keyof AttentionDetectorEvents>(
    event: K,
    ...args: Parameters<AttentionDetectorEvents[K]>
  ): boolean;
}
