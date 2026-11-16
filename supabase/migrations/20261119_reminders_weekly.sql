-- Rappels du calendrier (veille d'une décision de la Fed / BCE ou des résultats d'un favori) et résumé hebdomadaire.
alter table marches.devices
  add column if not exists remind_on boolean not null default false,
  add column if not exists remind_syms jsonb,      -- symboles d'actions suivis (30 au plus)
  add column if not exists remind_sent jsonb,      -- { "fed:2026-12-09": "2026-12-08", … } : rappels déjà envoyés
  add column if not exists weekly_on boolean not null default false,
  add column if not exists weekly_assets jsonb,    -- favoris suivis (30 au plus)
  add column if not exists weekly_sent date;       -- dernier envoi (jour local)
