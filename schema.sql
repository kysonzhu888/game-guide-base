CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  game_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_game_created
ON comments (game_slug, created_at DESC);
