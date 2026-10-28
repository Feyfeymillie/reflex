-- RefleX hub database: the subset of shared-family-record v0.3 the Thursday demo touches.
-- Clinical rows (encounter, observation, assessment, review, consent) are append-only.

CREATE TABLE IF NOT EXISTS household (
  household_id TEXT PRIMARY KEY,
  village      TEXT,
  ward_code    TEXT,
  district_code TEXT,
  hub_id       TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS person (
  person_id     TEXT PRIMARY KEY,
  household_id  TEXT NOT NULL REFERENCES household(household_id),
  role          TEXT NOT NULL CHECK (role IN ('mother','child','caregiver')),
  full_name     TEXT NOT NULL,
  phone_msisdn  TEXT,
  phone_owner   TEXT CHECK (phone_owner IN ('self','husband','relative','neighbour','none')),
  date_of_birth TEXT,
  dob_estimated INTEGER NOT NULL DEFAULT 1,
  mother_person_id TEXT REFERENCES person(person_id),
  preferred_language TEXT NOT NULL DEFAULT 'sw',
  sex           TEXT CHECK (sex IN ('female','male')),
  gestation_at_birth_weeks INTEGER,     -- children only; drives corrected age for preterm babies
  created_at    TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS consent (
  consent_id         TEXT PRIMARY KEY,
  subject_person_id  TEXT NOT NULL REFERENCES person(person_id),
  given_by_person_id TEXT NOT NULL REFERENCES person(person_id),
  module             TEXT NOT NULL,
  purpose            TEXT NOT NULL CHECK (purpose IN ('care','aggregate_reporting','research')),
  status             TEXT NOT NULL CHECK (status IN ('granted','withdrawn')),
  method             TEXT NOT NULL,
  consent_text_version TEXT NOT NULL,
  recorded_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pregnancy (
  pregnancy_id TEXT PRIMARY KEY,
  mother_id    TEXT NOT NULL REFERENCES person(person_id),
  lmp_date     TEXT,
  edd          TEXT,
  gravida      INTEGER,
  parity       INTEGER,
  anc_visits_count INTEGER,
  outcome      TEXT NOT NULL DEFAULT 'ongoing',
  delivery_date TEXT,
  delivery_place TEXT,
  gestation_weeks_at_reg INTEGER,
  rch4_json    TEXT,                   -- full RCH4 card profile from the frontend
  complications_text TEXT,
  history_text TEXT,
  created_at   TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS encounter (
  encounter_id TEXT PRIMARY KEY,
  person_id    TEXT NOT NULL REFERENCES person(person_id),
  pregnancy_id TEXT REFERENCES pregnancy(pregnancy_id),
  channel      TEXT NOT NULL DEFAULT 'chw_visit',
  module       TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  completed    INTEGER NOT NULL DEFAULT 0
);

-- Autosave writes one row per answer change; the latest row per (encounter, code) wins.
CREATE TABLE IF NOT EXISTS observation (
  observation_id TEXT PRIMARY KEY,
  encounter_id   TEXT NOT NULL REFERENCES encounter(encounter_id),
  code           TEXT NOT NULL,
  value          TEXT,
  source         TEXT NOT NULL DEFAULT 'chw_measured',
  recorded_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS obs_enc_code ON observation(encounter_id, code, recorded_at);

CREATE TABLE IF NOT EXISTS assessment (
  assessment_id TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL REFERENCES person(person_id),
  pregnancy_id  TEXT REFERENCES pregnancy(pregnancy_id),
  encounter_id  TEXT REFERENCES encounter(encounter_id),
  module        TEXT NOT NULL,
  model_version TEXT NOT NULL,
  score         REAL,
  band          TEXT NOT NULL CHECK (band IN ('low','medium','high','urgent')),
  top_factors   TEXT NOT NULL,          -- JSON list
  rule_override INTEGER NOT NULL DEFAULT 0,
  override_reasons TEXT,                -- JSON list of danger-sign codes that forced urgent
  computed_on   TEXT NOT NULL DEFAULT 'server',
  compute_ms    REAL,
  analysis_json TEXT,                 -- the exact object the frontend displays
  created_at    TEXT NOT NULL
);

-- Human in control: the CHW accepts or overrides every flag.
CREATE TABLE IF NOT EXISTS review (
  review_id     TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessment(assessment_id),
  decision      TEXT NOT NULL CHECK (decision IN ('accept','override')),
  final_band    TEXT NOT NULL CHECK (final_band IN ('low','medium','high','urgent')),
  reason        TEXT,
  reviewed_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referral (
  referral_id   TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessment(assessment_id),
  to_facility_code TEXT,
  urgency       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'created'
                CHECK (status IN ('created','sent','acknowledged','attended','lost')),
  status_updated_at TEXT NOT NULL
);

-- Child module: guidance shown, never a score.
CREATE TABLE IF NOT EXISTS guidance_event (
  guidance_event_id TEXT PRIMARY KEY,
  child_person_id   TEXT NOT NULL REFERENCES person(person_id),
  encounter_id      TEXT REFERENCES encounter(encounter_id),
  content_code      TEXT NOT NULL,
  trigger           TEXT NOT NULL CHECK (trigger IN ('age_schedule','parent_request','milestone_not_yet')),
  advised_contact_chw INTEGER NOT NULL DEFAULT 0,
  shown_at          TEXT NOT NULL
);

-- Parent taps "We did it today" on a play idea. One row per child, activity and day (repeat taps the same day are ignored).
-- Feeds the sticker chart only. Not an assessment and never scored.
CREATE TABLE IF NOT EXISTS play_log (
  play_log_id     TEXT PRIMARY KEY,
  child_person_id TEXT NOT NULL REFERENCES person(person_id),
  content_code    TEXT NOT NULL,
  done_on         TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  UNIQUE (child_person_id, content_code, done_on)
);
