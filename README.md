# AgResearch Labs — Software Developer Intern Assignment

## Overview

The **AgResearch Labs (ARL) Aeroponic Tray & Batch Management System** is a backend REST API designed to manage leafy greens grown in tray-based aeroponic beds.

The system tracks physical growing surfaces (**Trays**), plant cultivation lifecycles from seeding to harvest (**Batches**), and harvest yield reports (**Harvests**). It strictly enforces operational business rules, stage progression invariants, single active batch constraints per tray, and transaction safety.

---

## Tech Stack

- **Runtime**: Node.js (v20+)
- **Language**: TypeScript (Strict mode enabled)
- **Web Framework**: Fastify (Selected for native async performance, schema integration, and fast in-process HTTP injection testing)
- **Validation**: Zod (Ensures runtime validation and strict request decoding)
- **Database**: PostgreSQL (Source of truth for database constraints, partial unique indexing, and ACID transactions)
- **Database Driver**: `pg` (Native Node PostgreSQL driver)
- **Testing**: Vitest (Fast test runner for unit and integration testing)

---

## Architecture

The project follows a simple, clean layered architecture:

```
HTTP Requests
      │
      ▼
   Routes          (Fastify route registration & schema mapping)
      │
      ▼
 Controllers       (Request decoding, validation execution, status code mapping)
      │
      ▼
  Services         (Business logic, domain state machine transitions, invariant checks)
      │
      ▼
Repositories       (Data access abstraction: In-memory for Phase 1, PostgreSQL `pg` pool for Phase 2/3)
      │
      ▼
 PostgreSQL        (Source of truth, unique partial constraints, ACID transactions)
```

---

## Domain Model

- **Tray**: A physical growing surface in a facility.
  - `id`: UUID (Primary Key)
  - `code`: Unique identifier (e.g. `TRAY-001`)
  - `zone`: Facility section location (e.g. `ZONE-A`)
  - `capacity_units`: Integer > 0 representing tray size/capacity
  - `created_at`: Timestamp
- **Batch**: A set of plants of one crop seeded into a tray.
  - `id`: UUID (Primary Key)
  - `tray_id`: Foreign Key referencing `Tray.id`
  - `crop`: Crop type (e.g. `Romaine Lettuce`)
  - `seeded_on`: Seeding date (`YYYY-MM-DD`)
  - `stage`: Current lifecycle stage (`SEEDED` | `GERMINATION` | `GROWING` | `HARVEST_READY` | `HARVESTED`)
  - `expected_harvest_on`: Expected harvest date (`YYYY-MM-DD`)
  - `created_at`: Timestamp
- **Harvest**: Record of yield harvested from a `HARVEST_READY` batch.
  - `id`: UUID (Primary Key)
  - `batch_id`: Foreign Key referencing `Batch.id` (Unique per batch)
  - `harvested_on`: Date harvest occurred (`YYYY-MM-DD`)
  - `weight_grams`: Numeric >= 0
  - `grade`: Yield quality grade (`A` | `B` | `C`)
  - `created_at`: Timestamp

---

## Batch Lifecycle

Batches strictly progress through 5 sequential stages:

```
SEEDED ──► GERMINATION ──► GROWING ──► HARVEST_READY ──► HARVESTED
```

### Invariants & Stage Rules
1. **Single Step Progression**: Transitions move forward exactly one stage at a time (`SEEDED` → `GERMINATION` → `GROWING` → `HARVEST_READY`).
2. **No Stage Skipping**: A batch cannot skip stages (e.g. `SEEDED` directly to `GROWING` is rejected with HTTP 409).
3. **No Stage Reversal**: Stage transitions cannot move backward or repeat the same stage.
4. **Harvest Transition**: Transitioning to `HARVESTED` can ONLY occur via `POST /batches/:id/harvest` when the batch is in `HARVEST_READY` stage.
5. **Terminal Stage**: Once `HARVESTED`, the batch is terminal and cannot transition further. The associated tray becomes available for a new batch.

---

## Phase 1 — In-Memory REST API

Implemented in Phase 1: Fastify setup, Zod schemas, in-memory repository abstractions, core tray and batch creation endpoints, standardized error handling, and unit test suites.

---

## Phase 2 — PostgreSQL + Business Rules

### Database Design
The persistence layer uses PostgreSQL as the single source of truth for invariants and state transitions.

#### Migration Script: `src/db/migrations/001_initial.sql`
```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS trays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    zone VARCHAR(50) NOT NULL,
    capacity_units INT NOT NULL CHECK (capacity_units > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tray_id UUID NOT NULL REFERENCES trays(id) ON DELETE RESTRICT,
    crop VARCHAR(100) NOT NULL,
    seeded_on DATE NOT NULL,
    stage VARCHAR(20) NOT NULL CHECK (stage IN ('SEEDED', 'GERMINATION', 'GROWING', 'HARVEST_READY', 'HARVESTED')),
    expected_harvest_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_batch_per_tray 
ON batches(tray_id) 
WHERE stage <> 'HARVESTED';

CREATE TABLE IF NOT EXISTS harvests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL UNIQUE REFERENCES batches(id) ON DELETE RESTRICT,
    harvested_on DATE NOT NULL,
    weight_grams NUMERIC(10, 2) NOT NULL CHECK (weight_grams >= 0),
    grade VARCHAR(1) NOT NULL CHECK (grade IN ('A', 'B', 'C')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Critical Database Constraints & Indexing
1. **Primary Keys & Foreign Keys**: Standard relational integrity with `ON DELETE RESTRICT` preventing accidental deletion of referenced trays or batches.
2. **CHECK Constraints**:
   - `trays.capacity_units > 0`: Prevents non-positive capacity entries.
   - `batches.stage`: Restricted strictly to valid enum values (`SEEDED`, `GERMINATION`, `GROWING`, `HARVEST_READY`, `HARVESTED`).
   - `harvests.weight_grams >= 0`: Guarantees non-negative weight measurements.
   - `harvests.grade`: Restricted strictly to `'A'`, `'B'`, or `'C'`.
3. **Partial Unique Index (`one_active_batch_per_tray`)**:
   ```sql
   CREATE UNIQUE INDEX one_active_batch_per_tray 
   ON batches(tray_id) 
   WHERE stage <> 'HARVESTED';
   ```
   **Why this works**: A standard `UNIQUE(tray_id)` would prevent a tray from ever being reused once a batch is harvested. The partial unique index enforces uniqueness ONLY for rows where `stage <> 'HARVESTED'`. Once a batch transitions to `'HARVESTED'`, it drops out of the index predicate, allowing a new active batch to be seeded into that tray while preserving complete historical audit records.

### Transactions
The `POST /batches/:id/harvest` operation requires atomicity:
1. Verify batch exists and is in `HARVEST_READY` stage (`SELECT ... FOR UPDATE`).
2. Insert harvest record into `harvests` table.
3. Update batch stage in `batches` table to `'HARVESTED'`.

These operations are executed inside a single PostgreSQL ACID transaction (`BEGIN ... COMMIT`). If any step fails (e.g. duplicate harvest attempt or date invalidity), the entire transaction is rolled back (`ROLLBACK`), maintaining perfect data integrity.

### Filtering and Pagination (`GET /batches`)
`GET /batches` supports query parameters:
- `stage`: Filter by stage (`SEEDED`, `GERMINATION`, `GROWING`, `HARVEST_READY`, `HARVESTED`)
- `crop`: Case-insensitive partial match search on crop name
- `zone`: Join with `trays` table to filter by physical zone (`JOIN trays t ON b.tray_id = t.id WHERE LOWER(t.zone) = $1`)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

---

## API Documentation

### `POST /trays`
Creates a new tray.
- **Request Body**:
  ```json
  {
    "code": "TRAY-001",
    "zone": "ZONE-A",
    "capacity_units": 50
  }
  ```
- **Success Response (201 Created)**

### `GET /trays`
Lists all trays.

### `GET /trays/:id`
Retrieves details of a single tray.

### `POST /batches`
Seeds a new batch into an available tray.
- **Request Body**:
  ```json
  {
    "tray_id": "c1f7a08b-2d3b-4b2a-8d1e-9f3a2b1c4d5e",
    "crop": "Romaine Lettuce",
    "seeded_on": "2026-03-01",
    "expected_harvest_on": "2026-04-01"
  }
  ```
- **Success Response (201 Created)**

### `PATCH /batches/:id/stage`
Advances batch stage forward by one step.
- **Request Body (Optional)**:
  ```json
  {
    "target_stage": "GERMINATION"
  }
  ```
- **Success Response (200 OK)**

### `POST /batches/:id/harvest`
Records a harvest for a `HARVEST_READY` batch and transitions it to `HARVESTED`.
- **Request Body**:
  ```json
  {
    "harvested_on": "2026-04-01",
    "weight_grams": 520.5,
    "grade": "A"
  }
  ```
- **Success Response (201 Created)**

### `GET /batches`
Filterable and paginated list of batches.
- **Query Parameters**: `stage=GROWING&crop=lettuce&zone=ZONE-A&page=1&limit=20`
- **Success Response (200 OK)**:
  ```json
  {
    "data": [
      {
        "id": "b98a7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
        "tray_id": "c1f7a08b-2d3b-4b2a-8d1e-9f3a2b1c4d5e",
        "crop": "Romaine Lettuce",
        "seeded_on": "2026-03-01",
        "stage": "GROWING",
        "expected_harvest_on": "2026-04-01",
        "created_at": "2026-09-23T20:05:00.000Z",
        "zone": "ZONE-A"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20
  }
  ```

---

## Rule Enforcement Matrix

| Rule | Enforced in Validation | Enforced in Service | Enforced in Database | Reason |
| :--- | :--- | :--- | :--- | :--- |
| **Valid enum values / types** | Yes (Zod) | No | Yes (`CHECK`) | Defense in depth; invalid inputs are rejected before entering domain logic. |
| **Unique Tray Code** | No | Yes | Yes (`UNIQUE`) | Database guarantees uniqueness across concurrent requests. |
| **One active batch per tray** | No | Yes | Yes (Partial Index) | Database constraint protects against race conditions across app instances. |
| **Sequential stage transitions** | No | Yes | No | Workflow sequencing is domain state machine logic. |
| **Harvest requires `HARVEST_READY`** | No | Yes | Transaction Check | Verified under transaction lock (`FOR UPDATE`). |
| **Single harvest per batch** | No | Yes | Yes (`UNIQUE(batch_id)`) | Prevents duplicate harvest records at DB engine level. |

---

## Assumptions

1. **Date Formatting**: All date inputs (`seeded_on`, `expected_harvest_on`, `harvested_on`) require ISO 8601 calendar date format `YYYY-MM-DD`.
2. **Case Sensitivity**: Tray codes are compared case-insensitively. Crop names match case-insensitively during search filtering.
3. **Stage Patch Parameter**: `PATCH /batches/:id/stage` accepts an optional `{ "target_stage": "GERMINATION" }` or auto-advances to the immediate next stage if no payload is provided.

---

## Testing

Implemented with Vitest:
- `tests/tray.test.ts`: Tray creation, validation, unique code constraint, 404 & 400 error responses.
- `tests/batch.test.ts`: Batch seeding, validation, single active batch constraint enforcement (409).
- `tests/stage.test.ts`: Sequential stage progression, prevention of stage skipping and backward movement.
- `tests/harvest.test.ts`: Atomic harvest creation, `HARVEST_READY` requirement, tray reuse after harvest, single harvest limit.
- `tests/filtering.test.ts`: `GET /batches` filtering by stage, crop, zone (JOIN), and pagination structure.

Run tests:
```bash
npm run test
```

---

## Setup

1. **Clone repository**:
   ```bash
   git clone https://github.com/Abhinav053/AgResearch_Labs_assignment.git
   cd Argo
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure Environment**:
   ```bash
   cp .env.example .env
   ```
4. **Run Server**:
   ```bash
   npm run dev
   ```
5. **Execute Test Suite**:
   ```bash
   npm run test
   ```

---

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | Binding host address |
| `NODE_ENV` | `development` | Environment mode (`development` / `test` / `production`) |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `TEST_DATABASE_URL` | - | PostgreSQL test database connection string |

---

## What I Did Not Finish

Phases 1 & 2 are 100% complete and fully tested. Phase 3 (Concurrency Safety Integration Test against live Postgres) will be completed next.

---

## AI Usage

### Tools Used
- **Antigravity (Gemini 3.6 Flash)**: Architecture design, Fastify route setup, Zod schema validation, PostgreSQL partial indexing, Vitest test construction.

### Where AI Was Used
- Assisting in setting up TypeScript project structure, domain error hierarchy, PostgreSQL schema migrations, and designing clean repository abstractions.
