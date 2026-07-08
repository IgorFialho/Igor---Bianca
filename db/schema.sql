CREATE TABLE IF NOT EXISTS wedding_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME NOT NULL,
  venue VARCHAR(180) NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invitation_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  guest_name VARCHAR(150),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rsvp_responses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_code_id BIGINT REFERENCES invitation_codes(id) ON DELETE SET NULL,
  invite_code_used VARCHAR(80) NOT NULL,
  attendance VARCHAR(10) NOT NULL CHECK (attendance IN ('yes', 'no')),
  adults_count INTEGER NOT NULL DEFAULT 1 CHECK (adults_count >= 0),
  children_count INTEGER NOT NULL DEFAULT 0 CHECK (children_count >= 0),
  dietary_notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invite_access_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_code_id BIGINT REFERENCES invitation_codes(id) ON DELETE SET NULL,
  invite_code_used VARCHAR(80) NOT NULL,
  guest_name VARCHAR(150),
  ip_address VARCHAR(64),
  user_agent TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsvp_invite_code ON rsvp_responses(invite_code_used);
CREATE INDEX IF NOT EXISTS idx_rsvp_submitted_at ON rsvp_responses(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_code ON invite_access_logs(invite_code_used);
CREATE INDEX IF NOT EXISTS idx_access_date ON invite_access_logs(accessed_at DESC);

INSERT INTO wedding_events (title, event_date, event_time, venue, address)
SELECT
  'Cerimonia e Recepcao Ana & Bruno',
  DATE '2026-05-15',
  TIME '16:30',
  'Pampulha - Belo Horizonte',
  'Av. Otacílio Negrão de Lima, 7630 - Pampulha, Belo Horizonte - MG, 31365-450'
WHERE NOT EXISTS (SELECT 1 FROM wedding_events);

INSERT INTO invitation_codes (code, guest_name, is_active)
VALUES ('FLORESCER2026', 'Convidado Especial', TRUE)
ON CONFLICT (code) DO NOTHING;
