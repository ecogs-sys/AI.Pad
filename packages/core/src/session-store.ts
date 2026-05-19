import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { PersistedTabsSchema, type PersistedTabs } from '@aipad/contracts';

const FILE_NAME = 'sessions.json';

/**
 * Reads and writes the persisted tab list. Writes are atomic via temp-file + rename.
 * Reads validate against the Zod schema; corrupt or schema-mismatched files are renamed
 * to <FILE_NAME>.broken-<timestamp> so the app always boots.
 */
export class SessionStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly dir: string) {}

  async load(): Promise<PersistedTabs | null> {
    const path = join(this.dir, FILE_NAME);
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await this.backup(path);
      return null;
    }
    const result = PersistedTabsSchema.safeParse(parsed);
    if (!result.success) {
      await this.backup(path);
      return null;
    }
    return result.data;
  }

  /**
   * Save the payload atomically. Concurrent calls are serialized via a chained promise
   * so two simultaneous writes can't tear the file.
   */
  save(payload: PersistedTabs): Promise<void> {
    this.writeChain = this.writeChain.then(() => this.writeAtomic(payload)).catch(() => {});
    return this.writeChain;
  }

  private async writeAtomic(payload: PersistedTabs): Promise<void> {
    const path = join(this.dir, FILE_NAME);
    const tmp = `${path}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    const json = JSON.stringify(payload, null, 2);
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(tmp, json, 'utf8');
    await fs.rename(tmp, path);
  }

  private async backup(path: string): Promise<void> {
    const dest = `${path}.broken-${Date.now()}`;
    try {
      await fs.rename(path, dest);
    } catch {
      /* If we can't rename, drop it — the file is broken anyway. */
    }
  }
}
