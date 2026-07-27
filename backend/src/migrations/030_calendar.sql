-- 030: Kalender & Workspace
CREATE TABLE IF NOT EXISTS calendar_events (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  type          TEXT NOT NULL DEFAULT 'termin', -- 'termin','baustelle','wartung','service'
  color         TEXT DEFAULT '#2D9CDB',
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ,
  all_day       BOOLEAN DEFAULT FALSE,
  location      TEXT,
  customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  equipment_id  INTEGER REFERENCES customer_equipment(id) ON DELETE SET NULL,
  project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  assigned_to   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cal_company   ON calendar_events(company_id);
CREATE INDEX IF NOT EXISTS idx_cal_start     ON calendar_events(start_at);
CREATE INDEX IF NOT EXISTS idx_cal_type      ON calendar_events(type);

-- Workspace: Boards (Kanban + Notizen + To-dos + Schwarzes Brett)
CREATE TABLE IF NOT EXISTS workspace_boards (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'kanban', -- 'kanban','notes','todos','bulletin'
  title       TEXT NOT NULL,
  icon        TEXT DEFAULT 'ti-layout-kanban',
  color       TEXT DEFAULT '#2D9CDB',
  position    INTEGER DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace: Karten/Einträge
CREATE TABLE IF NOT EXISTS workspace_cards (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  board_id    INTEGER NOT NULL REFERENCES workspace_boards(id) ON DELETE CASCADE,
  column_key  TEXT DEFAULT 'open', -- für Kanban: 'open','inprogress','done'
  title       TEXT NOT NULL,
  content     TEXT,
  done        BOOLEAN DEFAULT FALSE,
  priority    TEXT DEFAULT 'normal', -- 'low','normal','high','urgent'
  due_date    DATE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  position    INTEGER DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ws_cards_board ON workspace_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_ws_cards_co    ON workspace_cards(company_id);
