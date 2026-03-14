/**
 * Get cached value from KV, or compute and cache it.
 */
export async function kvCacheGet<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const cached = await kv.get(key, 'json');
  if (cached !== null) return cached as T;

  const value = await compute();
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  return value;
}

/**
 * Invalidate a KV cache key.
 */
export async function kvInvalidate(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

/**
 * Invalidate all capability matching caches.
 */
export async function kvInvalidateCapabilityCache(kv: KVNamespace, tags: string[]): Promise<void> {
  await Promise.all(tags.map((tag) => kv.delete(`match:${tag}`)));
}
