function createSiteRateLimiter({ windowMs = 60000, defaultLimit = 20, maxBuckets = 5000 } = {}) {
    const buckets = new Map();

    function cleanup(now) {
        if (buckets.size < maxBuckets) return;
        for (const [key, entry] of buckets) {
            if (entry.resetAt <= now) buckets.delete(key);
        }
    }

    function consume(accountId, limit = defaultLimit) {
        const cap = Number(limit);
        if (!Number.isFinite(cap) || cap <= 0) return { allowed: true, remaining: Infinity, retryAfterSeconds: 0 };
        const now = Date.now();
        cleanup(now);
        const key = String(accountId || 'anonymous');
        let entry = buckets.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            buckets.set(key, entry);
        }
        if (entry.count >= cap) {
            const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
            return { allowed: false, remaining: 0, retryAfterSeconds };
        }
        entry.count += 1;
        return {
            allowed: true,
            remaining: Math.max(0, cap - entry.count),
            retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
        };
    }

    return { consume, clear: () => buckets.clear() };
}

function createSearchCache({ ttlMs = 300000, maxEntries = 200 } = {}) {
    const entries = new Map();

    function get(key) {
        const hit = entries.get(key);
        if (!hit) return null;
        if (hit.expiresAt <= Date.now()) {
            entries.delete(key);
            return null;
        }
        // Refresh insertion order for basic LRU eviction
        entries.delete(key);
        entries.set(key, hit);
        return hit.value;
    }

    function set(key, value, ttlOverride = ttlMs) {
        const ttl = Number(ttlOverride);
        if (!Number.isFinite(ttl) || ttl <= 0) return;
        if (entries.has(key)) entries.delete(key);
        while (entries.size >= maxEntries) {
            const oldestKey = entries.keys().next().value;
            entries.delete(oldestKey);
        }
        entries.set(key, { value, expiresAt: Date.now() + ttl });
    }

    return { get, set, clear: () => entries.clear() };
}

module.exports = { createSiteRateLimiter, createSearchCache };
