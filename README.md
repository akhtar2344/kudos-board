# Kudos Board

An internal employee kudos system: give a colleague a short public note of
appreciation, see a live feed of recent kudos, and (for admins) moderate
inappropriate submissions.

Built as **Task 2: Building from Scratch with Spec-Driven Development** —
the full requirements and technical design that drove this implementation
live in [`SPECIFICATION.md`](./SPECIFICATION.md). The original, unrefined
AI-generated draft (before the architect review step) is kept for
comparison in [`docs/SPEC_V0_DRAFT.md`](./docs/SPEC_V0_DRAFT.md).

## Stack

- **Backend:** Node.js + Express
- **Database:** SQLite, via Node's built-in `node:sqlite` module (no native
  compilation step required — chosen specifically to avoid `better-sqlite3`'s
  node-gyp build dependency, which doesn't work in network-restricted build
  environments)
- **Frontend:** Vanilla HTML/CSS/JS, no build step or framework

## Getting Started

```bash
npm install
npm start
```

The server seeds a small set of mock users on first run (see "Authentication"
below) and starts on `http://localhost:3000` by default (override with the
`PORT` environment variable).

## Authentication model

This is an internal tool with no real login flow in this iteration. A set of
mock users is seeded automatically, and the UI includes a **"Viewing as"**
switcher in the top bar that stands in for an SSO session. Despite the
authentication being mocked, **authorization is fully real**: every
admin-only API endpoint checks the current simulated user's role against the
database, and returns `403` if they don't hold the `admin` role. The first
seeded user ("Akhtar Widodo") is the admin account, so the moderation panel
can be tested immediately by selecting them in the switcher.

## Project structure

```
src/
  db.js       Database schema + connection
  seed.js     Seeds mock users/roles
  kudos.js    Core kudos logic: validation, duplicate detection, CRUD
  auth.js     Simulated session + role-based access control middleware
  server.js   Express app + API routes
public/
  index.html  App shell
  styles.css  Visual design ("appreciation card" theme)
  app.js      Frontend logic (UserSwitcher, UserPicker, KudosForm, KudosFeed, AdminModerationPanel)
test/
  kudos.test.js  Unit tests for validation/business logic
  auth.test.js   Integration tests for role-based access control
docs/
  SPEC_V0_DRAFT.md  Original unrefined AI-generated spec, for comparison
SPECIFICATION.md    Final, architect-approved spec used to build this
```

## Running tests

```bash
npm test
```

Covers: message validation (empty, too long, exactly-at-limit), self-kudos
rejection, duplicate-submission detection (within/outside the time window),
moderation (hide/unhide/delete and their effect on the public feed), feed
pagination, and role-based access control on every admin endpoint (admin →
200, non-admin → 403, no session → 401).

## API summary

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users` | none | List users (for pickers) |
| GET | `/api/kudos` | any user | Paginated public feed |
| POST | `/api/kudos` | any user | Submit a kudos |
| GET | `/api/admin/kudos` | admin | All kudos, including hidden |
| PATCH | `/api/admin/kudos/:id/hide` | admin | Hide a kudos |
| PATCH | `/api/admin/kudos/:id/unhide` | admin | Restore a hidden kudos |
| DELETE | `/api/admin/kudos/:id` | admin | Permanently delete a kudos |

Full request/response details are in `SPECIFICATION.md`.
