-- Migration: 001_initial.sql
-- Initial schema setup for Trays, Batches, and Harvests

-- Enable pgcrypto for gen_random_uuid() if needed (standard in Postgres 13+)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Trays Table
CREATE TABLE IF NOT EXISTS trays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    zone VARCHAR(50) NOT NULL,
    capacity_units INT NOT NULL CHECK (capacity_units > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Batches Table
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tray_id UUID NOT NULL REFERENCES trays(id) ON DELETE RESTRICT,
    crop VARCHAR(100) NOT NULL,
    seeded_on DATE NOT NULL,
    stage VARCHAR(20) NOT NULL CHECK (stage IN ('SEEDED', 'GERMINATION', 'GROWING', 'HARVEST_READY', 'HARVESTED')),
    expected_harvest_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial Unique Index: A tray can have only ONE active batch (stage != 'HARVESTED')
CREATE UNIQUE INDEX IF NOT EXISTS one_active_batch_per_tray 
ON batches(tray_id) 
WHERE stage <> 'HARVESTED';

-- Harvests Table
CREATE TABLE IF NOT EXISTS harvests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL UNIQUE REFERENCES batches(id) ON DELETE RESTRICT,
    harvested_on DATE NOT NULL,
    weight_grams NUMERIC(10, 2) NOT NULL CHECK (weight_grams >= 0),
    grade VARCHAR(1) NOT NULL CHECK (grade IN ('A', 'B', 'C')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
