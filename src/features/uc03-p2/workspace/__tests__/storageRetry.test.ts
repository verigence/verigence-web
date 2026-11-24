import { describe, expect, it, vi } from 'vitest';

import { StoragePutError, isRetryableStorageError, withStorageRetry } from '../p2Uploader';

const noWait = () => Promise.resolve();

describe('storage PUT retry (24 Nov 2026: "Upload was rejected by storage (HTTP 500)")', () => {
  it('a passing storage fault is tried again and the upload goes through', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new StoragePutError('Upload was rejected by storage (HTTP 500).', 500))
      .mockResolvedValueOnce(undefined);
    await expect(withStorageRetry(attempt, [1, 1], noWait)).resolves.toBeUndefined();
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('a dropped connection is tried again', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(new StoragePutError('Upload failed. Check the connection and retry.', 0))
      .mockRejectedValueOnce(new StoragePutError('Upload was rejected by storage (HTTP 503).', 503))
      .mockResolvedValueOnce(undefined);
    await expect(withStorageRetry(attempt, [1, 1], noWait)).resolves.toBeUndefined();
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('after the last attempt the PC sees the last error', async () => {
    const attempt = vi.fn().mockRejectedValue(new StoragePutError('Upload was rejected by storage (HTTP 500).', 500));
    await expect(withStorageRetry(attempt, [1, 1], noWait)).rejects.toThrow('HTTP 500');
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('a refusal (expired or wrong link) is not tried again', async () => {
    const attempt = vi.fn().mockRejectedValue(new StoragePutError('Upload was rejected by storage (HTTP 403).', 403));
    await expect(withStorageRetry(attempt, [1, 1], noWait)).rejects.toThrow('HTTP 403');
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(isRetryableStorageError(new Error('Upload timed out.'))).toBe(false);
    expect(isRetryableStorageError(new StoragePutError('x', 429))).toBe(true);
  });
});
