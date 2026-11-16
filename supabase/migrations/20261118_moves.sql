-- Alertes automatiques de forts mouvements (facultatives) : seuil en % (variation 24 h pour une crypto, séance sinon),
-- actifs suivis (favoris de l'appareil) et date du dernier envoi par actif (une notification par actif et par jour).
alter table marches.devices add column if not exists moves_pct double precision check (moves_pct is null or (moves_pct >= 1 and moves_pct <= 50));
alter table marches.devices add column if not exists moves_assets jsonb;
alter table marches.devices add column if not exists moves_sent jsonb;
