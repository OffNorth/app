-- Alertes techniques (calculées sur les bougies journalières) :
--   rsi : RSI 14 au-dessus (direction above) ou en dessous (below) du seuil `target` (1 à 99) ;
--   ma  : croisement de la MM20 au-dessus (above) ou en dessous (below) de la MM50 ; `last_sign` garde le dernier côté observé ;
--   vol : volume du jour ≥ `target` × moyenne des 20 jours précédents.
alter table marches.alerts drop constraint if exists alerts_metric_check;
alter table marches.alerts add constraint alerts_metric_check check (metric in ('price', 'pct', 'rsi', 'ma', 'vol'));
alter table marches.alerts add column if not exists symbol text check (symbol is null or length(symbol) <= 24);
alter table marches.alerts add column if not exists last_sign smallint;

-- Résumé quotidien par notification (facultatif) : heure locale choisie, fuseau, actifs suivis (favoris), dernier envoi.
alter table marches.devices add column if not exists summary_time text
  check (summary_time is null or summary_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table marches.devices add column if not exists tz text check (tz is null or length(tz) <= 64);
alter table marches.devices add column if not exists summary_assets jsonb;
alter table marches.devices add column if not exists summary_sent date;

-- Défis mensuels des groupes : valeur du compte au début du mois ; `stale` = compte modifié par un appareil, à revaloriser.
alter table marches.paper_accounts add column if not exists month_key text;
alter table marches.paper_accounts add column if not exists month_equity double precision;
alter table marches.paper_accounts add column if not exists stale boolean not null default true;
