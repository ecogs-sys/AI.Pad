import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerFsHandlers, type IpcLike, type DialogLike } from './fs-handlers.js';

interface RegisteredHandler {
  (event: unknown, payload: unknown): Promise<unknown>;
}

function makeFakeIpc(): { ipc: IpcLike; handlers: Map<string, RegisteredHandler> } {
  const handlers = new Map<string, RegisteredHandler>();
  const ipc: IpcLike = {
    handle: (channel, handler) => { handlers.set(channel, handler as RegisteredHandler); },
  };
  return { ipc, handlers };
}

describe('FsPathExists handler', () => {
  let tempDir: string;
  let tempFile: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'fs-handlers-'));
    tempFile = join(tempDir, 'file.txt');
    await writeFile(tempFile, 'hi');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns exists+isDirectory for a real directory', async () => {
    const { ipc, handlers } = makeFakeIpc();
    registerFsHandlers(ipc, () => null, {} as DialogLike);
    const result = await handlers.get('core.fs.path-exists')!({}, { path: tempDir });
    expect(result).toEqual({ exists: true, isDirectory: true });
  });

  it('returns exists but not directory for a real file', async () => {
    const { ipc, handlers } = makeFakeIpc();
    registerFsHandlers(ipc, () => null, {} as DialogLike);
    const result = await handlers.get('core.fs.path-exists')!({}, { path: tempFile });
    expect(result).toEqual({ exists: true, isDirectory: false });
  });

  it('returns exists=false for a missing path', async () => {
    const { ipc, handlers } = makeFakeIpc();
    registerFsHandlers(ipc, () => null, {} as DialogLike);
    const result = await handlers.get('core.fs.path-exists')!({}, { path: join(tempDir, 'nope') });
    expect(result).toEqual({ exists: false, isDirectory: false });
  });

  it('returns exists=false for an empty string payload', async () => {
    const { ipc, handlers } = makeFakeIpc();
    registerFsHandlers(ipc, () => null, {} as DialogLike);
    const result = await handlers.get('core.fs.path-exists')!({}, { path: '' });
    expect(result).toEqual({ exists: false, isDirectory: false });
  });

  it('returns exists=false for a malformed payload', async () => {
    const { ipc, handlers } = makeFakeIpc();
    registerFsHandlers(ipc, () => null, {} as DialogLike);
    const result = await handlers.get('core.fs.path-exists')!({}, { wrong: 'shape' });
    expect(result).toEqual({ exists: false, isDirectory: false });
  });
});

describe('FsPickDirectory handler', () => {
  it('returns { path } when the user picks a directory', async () => {
    const showOpenDialog = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/picked'] });
    const dialog: DialogLike = { showOpenDialog };
    const fakeWindow = {} as Electron.BrowserWindow;
    const { ipc, handlers } = makeFakeIpc();
    registerFsHandlers(ipc, () => fakeWindow, dialog);

    const result = await handlers.get('core.fs.pick-directory')!({}, { startPath: '/start' });

    expect(result).toEqual({ path: '/picked' });
    expect(showOpenDialog).toHaveBeenCalledWith(fakeWindow, {
      properties: ['openDirectory'],
      defaultPath: '/start',
    });
  });

  it('omits defaultPath when startPath is absent', async () => {
    const showOpenDialog = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/picked'] });
    const dialog: DialogLike = { showOpenDialog };
    const { ipc, handlers } = makeFakeIpc();
    registerFsHandlers(ipc, () => ({} as Electron.BrowserWindow), dialog);

    await handlers.get('core.fs.pick-directory')!({}, {});

    expect(showOpenDialog).toHaveBeenCalledWith(expect.anything(), {
      properties: ['openDirectory'],
    });
  });

  it('returns { cancelled: true } when the user cancels', async () => {
    const dialog: DialogLike = {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    };
    const { ipc, handlers } = makeFakeIpc();
    registerFsHandlers(ipc, () => ({} as Electron.BrowserWindow), dialog);
    const result = await handlers.get('core.fs.pick-directory')!({}, {});
    expect(result).toEqual({ cancelled: true });
  });

  it('returns { cancelled: true } when no window is available', async () => {
    const dialog: DialogLike = { showOpenDialog: vi.fn() };
    const { ipc, handlers } = makeFakeIpc();
    registerFsHandlers(ipc, () => null, dialog);
    const result = await handlers.get('core.fs.pick-directory')!({}, {});
    expect(result).toEqual({ cancelled: true });
    expect(dialog.showOpenDialog).not.toHaveBeenCalled();
  });

  it('returns { cancelled: true } when the payload is malformed', async () => {
    const dialog: DialogLike = { showOpenDialog: vi.fn() };
    const { ipc, handlers } = makeFakeIpc();
    registerFsHandlers(ipc, () => ({} as Electron.BrowserWindow), dialog);
    const result = await handlers.get('core.fs.pick-directory')!({}, { startPath: 5 });
    expect(result).toEqual({ cancelled: true });
    expect(dialog.showOpenDialog).not.toHaveBeenCalled();
  });
});
