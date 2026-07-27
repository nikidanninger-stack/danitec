-- 031: Gründungs-To-dos im Workspace
DO $$
DECLARE
  cid INTEGER;
  bid INTEGER;
BEGIN
  SELECT id INTO cid FROM companies LIMIT 1;
  IF cid IS NULL THEN RETURN; END IF;

  -- Board anlegen (nur wenn noch nicht vorhanden)
  IF NOT EXISTS (SELECT 1 FROM workspace_boards WHERE company_id=cid AND title='Danitec GmbH – Gründungs-To-dos') THEN
    INSERT INTO workspace_boards (company_id, title, type, icon, color)
    VALUES (cid, 'Danitec GmbH – Gründungs-To-dos', 'todos', 'ti-checklist', '#152248')
    RETURNING id INTO bid;

    INSERT INTO workspace_cards (company_id, board_id, column_key, title, priority, due_date) VALUES
    -- Organisation
    (cid,bid,'open','[Organisation] Alle bisherigen Gründungsdokumente sauber ablegen','high','2026-09-30'),
    (cid,bid,'open','[Organisation] Ausweise von Niklas und Jonas speichern','high','2026-09-30'),
    (cid,bid,'open','[Organisation] Meldezettel / Wohnsitzdaten bereithalten','high','2026-09-30'),
    -- Technik
    (cid,bid,'open','[Technik/F-Gase/Lager] Werkzeugliste erstellen','high','2026-09-30'),
    (cid,bid,'open','[Technik/F-Gase/Lager] Was brauchen wir um Gas einzukaufen','high','2026-09-30'),
    -- Finanzen
    (cid,bid,'open','[Finanzen/Buchhaltung] Doppelte Buchführung einrichten','normal',NULL),
    (cid,bid,'open','[Finanzen/Buchhaltung] Investitionsliste erstellen','high','2026-09-30'),
    (cid,bid,'open','[Finanzen/Buchhaltung] Rechnungsvorlage erstellen','high','2026-09-30'),
    (cid,bid,'open','[Finanzen/Buchhaltung] Mahnprozess festlegen','high','2026-09-30'),
    (cid,bid,'open','[Finanzen/Buchhaltung] Buchhaltungsablauf mit Steuerberater klären','high','2026-10-15'),
    (cid,bid,'open','[Finanzen/Preise] Stundensatz und Notdienstzuschlag final kalkulieren','high','2026-09-30'),
    (cid,bid,'open','[Finanzen/Preise] Anfahrtspauschalen final kalkulieren','high','2026-09-30'),
    -- GmbH / Notar
    (cid,bid,'open','[GmbH/Notar] Gesellschaftsvertrag intern durchgehen','high','2026-09-30'),
    (cid,bid,'open','[GmbH/Notar] Anteile, Geschäftsführer, Vertretung und Gewinnverteilung final klären','high','2026-09-30'),
    (cid,bid,'open','[GmbH/Notar] Geschäftsführerregelung / Vertretungsbefugnisse festlegen (wer darf was alleine/gemeinsam entscheiden)','high','2026-09-30'),
    (cid,bid,'open','[GmbH/Notar] Notar auswählen','high','2026-10-15'),
    (cid,bid,'open','[GmbH/Notar] Gesellschaftsvertrag an Notar schicken','normal','2026-11-15'),
    (cid,bid,'open','[GmbH/Notar] Gesellschaftsvertrag final vom Notar prüfen lassen','normal','2026-11-15'),
    (cid,bid,'open','[Bank] Stammkapital-Einzahlung mit Bank und Notar klären','normal','2027-01-15'),
    -- Interne Verträge
    (cid,bid,'open','[Interne Verträge] Ausstieg eines Gesellschafters regeln','high','2026-09-30'),
    (cid,bid,'open','[Interne Verträge] Krankheit / längere Arbeitsunfähigkeit regeln','high','2026-09-30'),
    (cid,bid,'open','[Interne Verträge] Fahrzeug- und Werkzeugregelung intern festlegen','high','2026-09-30'),
    (cid,bid,'open','[Interne Verträge] Allgemeine Preisliste (Material, Pauschalen, IBN Klima, Service)','high','2026-09-30'),
    (cid,bid,'open','[Interne Verträge] Interne Verträge finalisieren: Fahrzeug, Werkzeug, Ausstieg, Krankheit','normal','2026-11-15'),
    -- Website / Marketing
    (cid,bid,'open','[Website/Marketing] Slogan entwickeln','normal',NULL),
    (cid,bid,'open','[Website/Marketing] Visitenkarten / Arbeitskleidung / Fahrzeugbranding','high','2026-09-30'),
    (cid,bid,'open','[Website/Marketing] Domain sichern','normal','2026-11-15'),
    (cid,bid,'open','[Website/Marketing] Professionelle E-Mail-Struktur planen','normal','2026-11-15'),
    (cid,bid,'open','[Website/Marketing] Website finalisieren','normal','2026-11-15'),
    (cid,bid,'open','[Website/Marketing] Datenschutzerklärung finalisieren','low','2027-01-15'),
    (cid,bid,'open','[Website/Marketing] Cookie / Tracking-Entscheidungen treffen','low','2027-01-15'),
    (cid,bid,'open','[Website/Marketing] Google Business Profil vorbereiten','low','2027-02-15'),
    (cid,bid,'open','[Website/Marketing] Instagram / Social Media vorbereiten','low','2027-02-15'),
    -- Vertrieb / Vorlagen
    (cid,bid,'open','[Vertrieb/Vorlagen] Angebotsvorlage erstellen','high','2026-09-30'),
    (cid,bid,'open','[Vertrieb/Vorlagen] Auftragsbestätigung erstellen','high','2026-09-30'),
    (cid,bid,'open','[Vertrieb/Vorlagen] Rechnungsvorlage und Angebotsvorlage vorbereiten','normal','2026-11-15'),
    -- Betrieb / Vorlagen
    (cid,bid,'open','[Betrieb/Vorlagen] Regiebericht-Vorlage erstellen','high','2026-09-30'),
    (cid,bid,'open','[Betrieb/Vorlagen] Abnahmeprotokoll erstellen','high','2026-09-30'),
    -- Recht
    (cid,bid,'open','[Recht/Vertrieb] AGB / Zahlungsbedingungen vorbereiten','high','2026-09-30'),
    -- WKO
    (cid,bid,'open','[WKO/Gewerbe] WKO-Termin vereinbaren','high','2026-10-15'),
    (cid,bid,'open','[WKO/Gewerbe] Gewerbewortlaut mit WKO klären','high','2026-10-15'),
    (cid,bid,'open','[WKO/Gewerbe] Prüfen ob mehrere Gewerbe nötig sind','high','2026-10-15'),
    (cid,bid,'open','[WKO/Gewerbe] NeuFÖG-Förderungen prüfen','normal','2026-11-15'),
    (cid,bid,'open','[WKO/Gewerbe] Gewerbeanmeldung vorbereiten (noch nicht einreichen)','low','2027-01-31'),
    (cid,bid,'open','[WKO/Gewerbe] NeuFöG Formular vorbereiten falls nutzbar','low','2027-01-31'),
    -- Bank
    (cid,bid,'open','[Bank] Bankangebote für Firmenkonto einholen','high','2026-10-15'),
    (cid,bid,'open','[Bank] Firmenkonto vorbereiten','normal','2026-11-15'),
    -- Versicherungen
    (cid,bid,'open','[Versicherungen] Betriebshaftpflicht, Rechtsschutz, Fahrzeug/Werkzeug vergleichen','high','2026-10-15'),
    -- Finanzamt
    (cid,bid,'open','[Finanzamt/Steuerberater] Steuerberater auswählen','high','2026-10-15'),
    (cid,bid,'open','[Finanzamt/Steuerberater] Steuerliche Erfassung vorbereiten','low','2027-01-31');
  END IF;
END $$;
