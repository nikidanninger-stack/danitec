-- Migration 002: Logo & Farbanpassung
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_path TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_color TEXT DEFAULT '#185fa5';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS openai_api_key TEXT;
