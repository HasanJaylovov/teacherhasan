CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    blocked BOOLEAN NOT NULL DEFAULT FALSE,
    subscription_status TEXT NOT NULL DEFAULT 'trial',
    plan TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_until TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    speaking_count INTEGER NOT NULL DEFAULT 0,
    legal_consent JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
ON users (LOWER(email))
WHERE email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx
ON users (phone)
WHERE phone <> '';

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY,
    invoice_id TEXT UNIQUE,
    multicard_uuid UUID UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    user_name TEXT NOT NULL DEFAULT '',
    plan TEXT,
    months INTEGER,
    amount INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL,
    legal_consent JSONB NOT NULL DEFAULT '{}'::jsonb,
    multicard_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS payments_user_id_idx
ON payments(user_id);

CREATE INDEX IF NOT EXISTS payments_status_idx
ON payments(status);

CREATE TABLE IF NOT EXISTS speaking_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS speaking_results_user_id_idx
ON speaking_results(user_id);
