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

CREATE TABLE IF NOT EXISTS funnel_daily (
  event_date TEXT NOT NULL,
  event_name TEXT NOT NULL,
  page_type TEXT NOT NULL,
  game_slug TEXT NOT NULL DEFAULT '',
  event_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_date, event_name, page_type, game_slug)
);

CREATE INDEX IF NOT EXISTS idx_funnel_daily_event_date
ON funnel_daily (event_name, event_date DESC);
