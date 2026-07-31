-- Plaud Webhook Secret für automatische Zapier-Integration
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS plaud_webhook_secret VARCHAR(64),
  ADD COLUMN IF NOT EXISTS plaud_auto_create BOOLEAN DEFAULT true;
