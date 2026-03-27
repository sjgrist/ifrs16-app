PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Legal entities
CREATE TABLE IF NOT EXISTS entities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  currency    TEXT    NOT NULL DEFAULT 'GBP',
  country     TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- IBR / discount rate library
CREATE TABLE IF NOT EXISTS discount_rates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  label           TEXT    NOT NULL,
  currency        TEXT    NOT NULL,
  tenor_months    INTEGER NOT NULL,
  base_rate       REAL    NOT NULL,
  credit_spread   REAL    NOT NULL DEFAULT 0,
  security_adj    REAL    NOT NULL DEFAULT 0,
  ibr             REAL    NOT NULL,  -- base + spread - security adj
  effective_date  TEXT    NOT NULL,
  notes           TEXT    NOT NULL DEFAULT '',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Leases
CREATE TABLE IF NOT EXISTS leases (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id                   INTEGER NOT NULL REFERENCES entities(id) ON DELETE RESTRICT,
  lessor_name                 TEXT    NOT NULL DEFAULT '',
  asset_description           TEXT    NOT NULL DEFAULT '',
  asset_class                 TEXT    NOT NULL DEFAULT 'property',  -- property|vehicle|equipment|other
  commencement_date           TEXT    NOT NULL,
  term_months                 INTEGER NOT NULL,
  extension_option_months     INTEGER NOT NULL DEFAULT 0,
  extension_reasonably_certain INTEGER NOT NULL DEFAULT 0,  -- boolean
  currency                    TEXT    NOT NULL DEFAULT 'GBP',
  payment_amount              REAL    NOT NULL,
  payment_frequency           TEXT    NOT NULL DEFAULT 'monthly',  -- monthly|quarterly|annual
  payment_timing              TEXT    NOT NULL DEFAULT 'arrears',  -- advance|arrears
  rent_free_months            INTEGER NOT NULL DEFAULT 0,
  initial_direct_costs        REAL    NOT NULL DEFAULT 0,
  lease_incentives_receivable REAL    NOT NULL DEFAULT 0,
  prepaid_payments            REAL    NOT NULL DEFAULT 0,
  residual_value_guarantee    REAL    NOT NULL DEFAULT 0,
  discount_rate               REAL    NOT NULL,  -- annual rate e.g. 0.05
  discount_rate_id            INTEGER REFERENCES discount_rates(id),
  country                     TEXT    NOT NULL DEFAULT '',
  status                      TEXT    NOT NULL DEFAULT 'active',  -- active|expired|modified
  pdf_filename                TEXT,
  notes                       TEXT    NOT NULL DEFAULT '',
  created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Pre-computed schedule rows (cached for performance)
CREATE TABLE IF NOT EXISTS schedule_rows (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id          INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  period            INTEGER NOT NULL,
  date              TEXT    NOT NULL,
  opening_liability REAL    NOT NULL,
  interest_charge   REAL    NOT NULL,
  payment           REAL    NOT NULL,
  closing_liability REAL    NOT NULL,
  rou_depreciation  REAL    NOT NULL,
  closing_rou       REAL    NOT NULL,
  total_pl_charge   REAL    NOT NULL,
  UNIQUE(lease_id, period)
);

-- Chart of accounts (per entity + asset class)
CREATE TABLE IF NOT EXISTS account_codes (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id                   INTEGER REFERENCES entities(id) ON DELETE CASCADE,
  asset_class                 TEXT    NOT NULL DEFAULT 'all',
  rou_asset                   TEXT    NOT NULL DEFAULT '01-1600',
  accumulated_depreciation    TEXT    NOT NULL DEFAULT '01-1610',
  lease_liability_current     TEXT    NOT NULL DEFAULT '01-2300',
  lease_liability_non_current TEXT    NOT NULL DEFAULT '01-2310',
  interest_expense            TEXT    NOT NULL DEFAULT '01-7100',
  depreciation_expense        TEXT    NOT NULL DEFAULT '01-7200',
  cash_accruals               TEXT    NOT NULL DEFAULT '01-2100',
  UNIQUE(entity_id, asset_class)
);

-- App settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('low_value_threshold_usd', '5000'),
  ('short_term_threshold_months', '12');

-- Default entity
INSERT OR IGNORE INTO entities (name, currency, country) VALUES ('Default Entity', 'GBP', 'GB');
