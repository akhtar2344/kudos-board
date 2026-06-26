# Kudos System Specification

# Kudos System Specification

> **Repository:** https://github.com/akhtar2344/kudos-board
> **Status:** APPROVED — refined and reviewed by the Architect (Step 2 of Task 2) prior to implementation.
> See `docs/SPEC_V0_DRAFT.md` for the original AI-generated draft this document was refined from.

## Functional Requirements

### User Stories

1. As a user, I can see a list of my colleagues to choose from.
2. As a user, I can select a colleague from that list as the kudos recipient.
3. As a user, I can write a short message of appreciation (max 500 characters).
4. As a user, I can submit the kudos, which gets stored in the database and is immediately visible in the feed.
5. As a user, I can view a public feed of recent kudos on the main dashboard, sorted newest-first.
6. **As an administrator, I can hide or delete inappropriate kudos messages**, so that offensive, spammy, or otherwise inappropriate content does not remain visible to the rest of the organization. *(Added by the Architect — not present in the original request.)*
7. As an administrator, when I hide a kudos message, I can optionally record a reason, so there's an audit trail for why content was moderated.
8. As a user, I cannot submit the exact same kudos message to the same recipient more than once within a short time window (anti-spam / duplicate-submission protection).

### Acceptance Criteria

**Kudos submission**
- The recipient must be selected from the existing colleague list (no free-text recipient).
- A user cannot send a kudos to themselves.
- The message must be non-empty and ≤ 500 characters; whitespace-only messages are rejected.
- On submit, the kudos is timestamped and immediately appears at the top of the public feed.
- If the same sender submits an identical message to the same recipient within 5 minutes, the submission is rejected with a clear "duplicate submission" error, to prevent accidental double-clicks and basic spam.

**Public feed**
- The feed shows only kudos where `is_visible = true`.
- The feed is paginated (e.g. 20 per page) rather than loading the entire history at once.
- Each feed entry shows: sender name, recipient name, message, and a relative timestamp (e.g. "2 hours ago").

**Content moderation (admin only)**
- Only users with the `admin` role can access moderation actions.
- An admin can hide a kudos (sets `is_visible = false`) without permanently deleting it, preserving an audit trail.
- An admin can permanently delete a kudos if necessary (e.g. legal/HR request).
- When a kudos is hidden, the system records *who* hid it, *when*, and optionally *why* (see schema below).
- Hidden kudos are excluded from the public feed but remain visible to admins in a separate moderation view, so decisions can be reviewed or reversed.
- Non-admin users attempting to access moderation endpoints receive a 403 Forbidden response.

**Edge cases considered**
- *Spam:* handled by the duplicate-submission check above (same sender + recipient + message within a short window).
- *Inappropriate content:* no automated content filtering is in scope for this version — relies on admin moderation after the fact. (Documented as a known limitation; see "Out of Scope" below.)
- *Self-kudos:* explicitly disallowed (a user cannot select themselves as recipient).
- *Deleted/hidden recipient or sender:* if a user is later deactivated, their historical kudos remain in the feed (we do not retroactively hide kudos involving deactivated users).

### Out of Scope (for this iteration)
- Automated profanity/spam-content filtering (regex/ML-based) — flagged as a future enhancement, not implemented now.
- Real user authentication (login/password/SSO integration) — see "Authentication" below for what *is* in scope.
- Notifications (email/Slack) when a user receives a kudos.

## Technical Design

### Authentication Model

This is an internal tool. Real SSO integration is out of scope for this iteration. Instead:
- The system ships with a **seeded set of mock users**, each already considered "authenticated."
- A lightweight **session-simulation layer** lets the UI know which user is "currently logged in" (a simple user switcher in the UI, standing in for what would normally come from an SSO session). This keeps the authorization logic (who can do what) realistic and testable, without building real login infrastructure.
- All API endpoints still enforce authorization checks (e.g. admin-only routes) based on the current simulated user — this is a deliberate design choice so the authorization code path is real and demonstrable, even though the authentication path is mocked.

### Database Schema

**`users`**
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT NOT NULL | |
| email | TEXT NOT NULL UNIQUE | |
| created_at | DATETIME | default now |

**`roles`** *(added by the Architect to support moderation)*
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT NOT NULL UNIQUE | e.g. `"admin"`, `"member"` |

**`user_roles`** *(join table — a user can hold more than one role)*
| Field | Type | Notes |
|---|---|---|
| user_id | INTEGER FK -> users.id | |
| role_id | INTEGER FK -> roles.id | |
| | | PRIMARY KEY (user_id, role_id) |

**`kudos`** *(updated by the Architect for moderation support)*
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| sender_id | INTEGER FK -> users.id | |
| recipient_id | INTEGER FK -> users.id | |
| message | TEXT NOT NULL | max 500 chars, enforced at API layer |
| created_at | DATETIME NOT NULL | default now |
| **is_visible** | **BOOLEAN NOT NULL DEFAULT true** | **new — false = hidden by moderation** |
| **moderated_by** | **INTEGER FK -> users.id, NULLABLE** | **new — admin who hid/deleted it** |
| **moderated_at** | **DATETIME, NULLABLE** | **new — when moderation action occurred** |
| **reason_for_moderation** | **TEXT, NULLABLE** | **new — optional free-text reason** |

Rationale for using a separate `roles`/`user_roles` design instead of a single `is_admin` boolean on `users`: it scales cleanly if more roles are needed later (e.g. "team lead" who can only moderate their own team's kudos) without another schema migration, at the cost of one extra join for permission checks — an acceptable tradeoff for an internal tool expected to grow.

### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | any user | List all users (for the colleague picker and the user-switcher) |
| GET | `/api/kudos` | any user | Paginated public feed — only `is_visible = true` rows, newest first |
| POST | `/api/kudos` | any user | Create a new kudos. Validates: recipient exists, recipient ≠ sender, message length, duplicate-submission window |
| GET | `/api/admin/kudos` | admin only | All kudos including hidden ones, for the moderation view |
| PATCH | `/api/admin/kudos/:id/hide` | admin only | Sets `is_visible=false`, records `moderated_by`/`moderated_at`/`reason_for_moderation` |
| PATCH | `/api/admin/kudos/:id/unhide` | admin only | Reverses a hide action |
| DELETE | `/api/admin/kudos/:id` | admin only | Permanently deletes a kudos record |

All `admin`-scoped endpoints check the current simulated user's role via the `user_roles`/`roles` tables and return `403` if the role check fails.

### Frontend Components

- `UserSwitcher` — simulates "who am I logged in as" (stand-in for SSO session)
- `UserPicker` — dropdown/searchable list to select a kudos recipient
- `KudosForm` — recipient picker + message textarea (with live character count) + submit button; surfaces validation and duplicate-submission errors inline
- `KudosFeed` — paginated list of visible kudos, auto-refreshing on new submissions
- `AdminModerationPanel` — *(new)* admin-only view listing all kudos (visible + hidden), with hide/unhide/delete actions and a reason input when hiding

### Security Considerations
- All write endpoints (`POST`, `PATCH`, `DELETE`) validate the simulated current user server-side, not just in the UI, so a user can't bypass admin checks by hiding/showing UI elements client-side.
- Message content is stored and rendered with output-escaping on the frontend to prevent stored XSS via kudos messages.
- Input length limits (500 chars) enforced server-side, not just in the HTML `maxlength` attribute.

### Performance Considerations
- The public feed is paginated server-side (default 20 per page) rather than returning the full kudos history.
- An index on `(is_visible, created_at)` supports efficient feed queries as data grows.
- An index on `(sender_id, recipient_id, created_at)` supports the duplicate-submission check without a full table scan.

### Error Handling & Logging
- All API responses use consistent JSON error shapes: `{ "error": { "code": "...", "message": "..." } }`.
- Validation errors return `400` with a field-specific message (e.g. "message exceeds 500 characters").
- Authorization failures return `403` with a generic message (no leakage of *why* — e.g. don't reveal which role is required).
- Server-side errors are logged with enough context (endpoint, user id, timestamp) to debug without logging the full message content unnecessarily.

## Implementation Plan

1. **Project scaffold** — backend (Node/Express), SQLite DB, static frontend served by Express.
2. **Database layer** — schema migrations for `users`, `roles`, `user_roles`, `kudos` (with moderation fields); seed script with mock users and roles.
3. **Core kudos flow** — `GET /api/users`, `POST /api/kudos` (with validation + duplicate check), `GET /api/kudos` (paginated feed).
4. **Moderation flow** — `GET/PATCH/DELETE /api/admin/kudos/*`, role-check middleware.
5. **Frontend** — `UserSwitcher`, `UserPicker`, `KudosForm`, `KudosFeed`, `AdminModerationPanel`; wire up to the API.
6. **Testing** — unit tests for validation logic (message length, self-kudos, duplicate detection) and role-based access control; manual end-to-end smoke test of the full flow.
7. **Deployment considerations** — environment variables for DB path/port; documented in `README.md`; runnable locally via `npm install && npm start` with no external service dependencies (SQLite is file-based).

### Task Dependencies
- Step 2 (DB layer) blocks Steps 3 and 4.
- Step 3 (core kudos flow) blocks Step 5 (frontend can't wire up to endpoints that don't exist yet).
- Step 4 (moderation flow) blocks the `AdminModerationPanel` portion of Step 5.
- Step 6 (testing) runs alongside Steps 3–5, not strictly after.

### Testing Strategy
- Backend: unit tests for validation rules and the duplicate-submission window logic, run against an in-memory/temp SQLite DB.
- Backend: integration tests for role-based access control on admin endpoints (admin vs. non-admin user gets 200 vs. 403).
- Frontend: manual smoke testing of the full user flow (submit kudos → appears in feed → admin hides it → disappears from feed → admin unhides it → reappears).

### Deployment Considerations
- This is designed to run as a single Node process for an internal tool — no containerization required for this iteration, though a `Dockerfile` could be added later.
- SQLite file lives on local disk; for multi-instance deployment this would need to move to a shared database (e.g. Postgres) — documented as a future consideration, not implemented now.
