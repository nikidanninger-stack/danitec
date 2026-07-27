-- 032: Workspace Cards – Kategorie und Startdatum
ALTER TABLE workspace_cards ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE workspace_cards ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE workspace_cards ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open'; -- 'open','inprogress','done'

-- Kategorie aus Titel extrahieren und Status setzen
UPDATE workspace_cards SET
  category = CASE
    WHEN title LIKE '[%]%' THEN TRIM(SUBSTRING(title FROM 2 FOR POSITION(']' IN title)-2))
    ELSE NULL
  END,
  status = CASE done WHEN true THEN 'done' ELSE column_key END
WHERE category IS NULL;
