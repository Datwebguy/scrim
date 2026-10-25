-- Ask runs on the site owner's NEAR AI credits, so each account gets a daily allowance.
CREATE TABLE ask_usage (
  account_id text NOT NULL,
  day        date NOT NULL,
  questions  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);
