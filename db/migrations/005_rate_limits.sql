-- Fixed-window request counters, one row per client, route group and minute.
CREATE TABLE rate_limits (
  key           text   NOT NULL,
  window_start  bigint NOT NULL,
  hits          int    NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
