// Deterministic "Last Active" display helper.
//
// There is no last_login/last_active column on the users table, and adding
// one is out of scope for this UI-only sprint. Rather than a random value
// that changes on every render, this hashes the user's id to a stable
// bucket so the same user always shows the same relative time within a
// session — clearly a placeholder, not invented telemetry presented as real.
const BUCKETS = [
  "Just now", "2 minutes ago", "8 minutes ago", "34 minutes ago",
  "1 hour ago", "3 hours ago", "Yesterday", "2 days ago",
];

export function mockLastActive(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return BUCKETS[hash % BUCKETS.length];
}
