-- ─── Performance-Indizes für häufige Queries ─────────────────────────────────
-- Serviceberichte
CREATE INDEX IF NOT EXISTS idx_service_reports_company    ON service_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_customer   ON service_reports(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_status     ON service_reports(status);
CREATE INDEX IF NOT EXISTS idx_service_reports_date       ON service_reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_service_reports_equipment  ON service_reports(equipment_id);

-- Kundenanlagen
CREATE INDEX IF NOT EXISTS idx_equipment_company          ON customer_equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_equipment_customer         ON customer_equipment(customer_id);
CREATE INDEX IF NOT EXISTS idx_equipment_next_maint       ON customer_equipment(next_maintenance);
CREATE INDEX IF NOT EXISTS idx_equipment_status           ON customer_equipment(status);

-- Wartungsverträge
CREATE INDEX IF NOT EXISTS idx_maint_contracts_company    ON maintenance_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_maint_contracts_customer   ON maintenance_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_maint_contracts_status     ON maintenance_contracts(status);
CREATE INDEX IF NOT EXISTS idx_maint_contracts_next_svc   ON maintenance_contracts(next_service_date);

-- Planungsprojekte
CREATE INDEX IF NOT EXISTS idx_projects_company           ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer          ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status            ON projects(status);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project      ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_project      ON project_notes(project_id);

-- F-Gase
CREATE INDEX IF NOT EXISTS idx_fgas_company               ON fgas_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_fgas_customer              ON fgas_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_fgas_equipment             ON fgas_logs(equipment_id);
CREATE INDEX IF NOT EXISTS idx_fgas_date                  ON fgas_logs(log_date DESC);

-- Arbeitszeit
CREATE INDEX IF NOT EXISTS idx_time_entries_company       ON time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user          ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date          ON time_entries(entry_date DESC);

-- Eingangsrechnungen (nur wenn Tabelle existiert)
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_incoming_inv_company ON incoming_invoices(company_id);
  CREATE INDEX IF NOT EXISTS idx_incoming_inv_status  ON incoming_invoices(status);
  CREATE INDEX IF NOT EXISTS idx_incoming_inv_date    ON incoming_invoices(invoice_date DESC);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Order-Number-Sequenz (häufig gelockt)
CREATE INDEX IF NOT EXISTS idx_order_num_seq_company      ON order_number_seq(company_id, prefix);
