# Kudos System - Initial Specification (v0, AI-Generated)

> **Status:** DRAFT — generated directly from the initial prompt, not yet reviewed by the architect.
> This version is intentionally left as-is to show the "before" state, prior to Step 2 refinement.

## Functional Requirements

### User Stories

1. As a user, I can see a list of my colleagues.
2. As a user, I can select a colleague from that list.
3. As a user, I can write a short message of appreciation (a "kudos").
4. As a user, I can submit the kudos, which is saved to the database.
5. As a user, I can view a public feed on the main dashboard showing recently submitted kudos.

### Acceptance Criteria

- The colleague list must be selectable via a dropdown or searchable list.
- The kudos message must not be empty.
- Submitted kudos appear in the public feed, sorted by most recent first.
- The feed is visible to any logged-in user.

## Technical Design

### Database Schema

**Users table**
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | |
| email | TEXT | unique |

**Kudos table**
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| sender_id | INTEGER FK -> Users.id | |
| recipient_id | INTEGER FK -> Users.id | |
| message | TEXT | |
| created_at | DATETIME | |

### API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /api/users | List all users (for the colleague picker) |
| POST | /api/kudos | Create a new kudos |
| GET | /api/kudos | List recent kudos for the public feed |

### Frontend Components

- `UserPicker` — dropdown to select a colleague
- `KudosForm` — message textarea + submit button
- `KudosFeed` — list of recent kudos, auto-refreshing

## Implementation Plan

1. Set up project scaffold (backend + frontend + DB)
2. Implement Users table and seed data
3. Implement Kudos table and POST /api/kudos
4. Implement GET /api/kudos and the feed UI
5. Implement the kudos submission form
6. Basic styling and responsive layout
