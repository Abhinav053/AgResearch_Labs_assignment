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
- **Database**: PostgreSQL (Source of truth for database constraints, partial unique indexing, and ACID transactions in Phase 2 & 3)
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

### What Was Implemented
- Fastify server configuration with TypeScript.
- Comprehensive request validation schemas powered by Zod.
- Standardized error handling middleware formatting all error responses into `{ "error": { "code": "...", "message": "..." } }`.
- Domain entities: `Tray` and `Batch`.
- In-memory repositories (`InMemoryTrayRepository`, `InMemoryBatchRepository`).
- Core Endpoints:
  - `POST /trays`: Create a tray.
  - `GET /trays`: List all trays.
  - `GET /trays/:id`: Retrieve single tray by ID (404 if not found).
  - `POST /batches`: Seed a new batch into a tray (rejects if tray already has an active batch with 409).

### Validation Strategy
- Request bodies are validated using Zod schemas at the controller boundary.
- Non-conforming payloads (missing required fields, negative capacity units, invalid date formats, expected harvest date prior to seeding date) trigger HTTP `400 Bad Request`.

### Error Handling
- Custom error hierarchy (`AppError`, `NotFoundError`, `ConflictError`, `ValidationError`).
- Consistent HTTP status codes:
  - `400`: Invalid input or malformed JSON.
  - `404`: Requested tray or batch does not exist.
  - `409`: Tray already contains an active batch or duplicate tray code exists.

### Important Design Decisions
1. **UUID v4**: Used for all primary key identifiers to guarantee global uniqueness and eliminate sequential ID enumeration.
2. **In-Memory Repositories**: Implemented using TypeScript `Map<string, Entity>` wrapped behind clean interfaces (`ITrayRepository`, `IBatchRepository`) to allow seamless drop-in replacement with PostgreSQL in Phase 2.

### How to Run Tests
```bash
npm run test
```

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
- **Success Response (201 Created)**:
  ```json
  {
    "id": "c1f7a08b-2d3b-4b2a-8d1e-9f3a2b1c4d5e",
    "code": "TRAY-001",
    "zone": "ZONE-A",
    "capacity_units": 50,
    "created_at": "2026-09-23T20:00:00.000Z"
  }
  ```
- **Error Response (409 Conflict)**:
  ```json
  {
    "error": {
      "code": "TRAY_CODE_EXISTS",
      "message": "Tray with code 'TRAY-001' already exists"
    }
  }
  ```

### `GET /trays`
Returns array of all trays.
- **Success Response (200 OK)**:
  ```json
  [
    {
      "id": "c1f7a08b-2d3b-4b2a-8d1e-9f3a2b1c4d5e",
      "code": "TRAY-001",
      "zone": "ZONE-A",
      "capacity_units": 50,
      "created_at": "2026-09-23T20:00:00.000Z"
    }
  ]
  ```

### `GET /trays/:id`
Retrieves details of a specific tray.
- **Success Response (200 OK)**
- **Error Response (404 Not Found)**:
  ```json
  {
    "error": {
      "code": "TRAY_NOT_FOUND",
      "message": "Tray with ID 'c1f7a08b-...' not found"
    }
  }
  ```

### `POST /batches`
Seeds a new batch into a tray.
- **Request Body**:
  ```json
  {
    "tray_id": "c1f7a08b-2d3b-4b2a-8d1e-9f3a2b1c4d5e",
    "crop": "Romaine Lettuce",
    "seeded_on": "2026-03-01",
    "expected_harvest_on": "2026-04-01"
  }
  ```
- **Success Response (201 Created)**:
  ```json
  {
    "id": "b98a7c6d-5e4f-3a2b-1c0d-9e8f7a6b5c4d",
    "tray_id": "c1f7a08b-2d3b-4b2a-8d1e-9f3a2b1c4d5e",
    "crop": "Romaine Lettuce",
    "seeded_on": "2026-03-01",
    "stage": "SEEDED",
    "expected_harvest_on": "2026-04-01",
    "created_at": "2026-09-23T20:05:00.000Z"
  }
  ```
- **Error Response (409 Conflict)**:
  ```json
  {
    "error": {
      "code": "TRAY_ALREADY_HAS_ACTIVE_BATCH",
      "message": "Tray already contains an active batch"
    }
  }
  ```

---

## Rule Enforcement

| Rule | Enforced in Service | Enforced in Database | Reason |
| :--- | :--- | :--- | :--- |
| **Valid input schema** | Yes (Zod) | Yes (`CHECK` constraints) | Defense in depth; reject invalid formats early at controller boundary. |
| **Unique Tray Code** | Yes | Yes (`UNIQUE` constraint) | Prevents duplicate physical tray labeling. |
| **One active batch per tray** | Yes | Yes (Partial Unique Index `WHERE stage <> 'HARVESTED'`) | Service checks pre-emptively; DB index guarantees atomic concurrency protection. |
| **Sequential stage transitions** | Yes | No | State machine sequencing is business workflow logic belonging in the service layer. |
| **Harvest requires `HARVEST_READY`** | Yes | No | Workflow state check before recording harvest payload. |
| **Single harvest per batch** | Yes | Yes (`UNIQUE(batch_id)`) | Guarantees strict 1:1 ratio between batch and harvest record. |

---

## Assumptions

1. **Date Formatting**: All date inputs (`seeded_on`, `expected_harvest_on`, `harvested_on`) require ISO 8601 calendar date format `YYYY-MM-DD`.
2. **Case Sensitivity**: Tray codes are compared case-insensitively to prevent duplicates like `tray-01` and `TRAY-01`. Crop names match case-insensitively during search filtering.
3. **Stage Patch Parameter**: `PATCH /batches/:id/stage` can accept an optional `{ "target_stage": "GERMINATION" }` payload or operate without a payload to auto-advance to the immediate next stage.

---

## Testing

Implemented with Vitest:
- `tests/tray.test.ts`: Tray creation, validation, unique code constraint, 404 & 400 error responses.
- `tests/batch.test.ts`: Batch seeding, validation, single active batch constraint enforcement (409).

Run tests:
```bash
npm run test
```

---

## Setup

1. **Clone repository**:
   ```bash
   git clone <repo-url>
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
4. **Run Phase 1 in Development mode**:
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
| `DATABASE_URL` | - | PostgreSQL connection string (Phase 2 & 3) |
| `TEST_DATABASE_URL` | - | PostgreSQL test connection string (Phase 2 & 3) |

---

## What I Did Not Finish

Phase 1 is 100% complete and fully tested. PostgreSQL integration (Phase 2) and Concurrency testing (Phase 3) will be implemented in subsequent phases.

---

## AI Usage

### Tools Used
- **Antigravity (Gemini 3.6 Flash)**: Architecture design, Fastify route setup, Zod schema validation, Vitest test suite construction.

### Where AI Was Used
- Assisting in setting up TypeScript project structure, domain error hierarchy, and designing clean repository abstractions for switching between memory and PostgreSQL storage.
