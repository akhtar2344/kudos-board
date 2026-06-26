// src/server.js
// Express server wiring together the DB, auth, and kudos modules.

const express = require("express");
const path = require("path");
const { createDatabase } = require("./db");
const { seed } = require("./seed");
const { requireUser, requireRole, userHasRole } = require("./auth");
const {
  ValidationError,
  createKudos,
  getPublicFeed,
  getAllKudosForModeration,
  hideKudos,
  unhideKudos,
  deleteKudos,
} = require("./kudos");

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  // GET /api/users - list all users (colleague picker + user switcher)
  app.get("/api/users", (req, res) => {
    const users = db
      .prepare(
        `SELECT u.id, u.name, u.email,
                EXISTS(
                  SELECT 1 FROM user_roles ur
                  JOIN roles r ON r.id = ur.role_id
                  WHERE ur.user_id = u.id AND r.name = 'admin'
                ) AS is_admin
         FROM users u
         ORDER BY u.name`
      )
      .all();
    res.json({ users: users.map((u) => ({ ...u, is_admin: Boolean(u.is_admin) })) });
  });

  // GET /api/kudos - public feed, paginated, visible only
  app.get("/api/kudos", requireUser(db), (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
    const feed = getPublicFeed(db, { page, pageSize });
    res.json(feed);
  });

  // POST /api/kudos - submit a new kudos
  app.post("/api/kudos", requireUser(db), (req, res) => {
    try {
      const kudos = createKudos(db, {
        senderId: req.currentUser.id,
        recipientId: Number(req.body.recipientId),
        message: req.body.message,
      });
      res.status(201).json({ kudos });
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
      }
      console.error("Unexpected error creating kudos:", err.message);
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  // GET /api/admin/kudos - moderation view (admin only)
  app.get("/api/admin/kudos", requireUser(db), requireRole(db, "admin"), (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const feed = getAllKudosForModeration(db, { page, pageSize: 50 });
    res.json(feed);
  });

  // PATCH /api/admin/kudos/:id/hide
  app.patch(
    "/api/admin/kudos/:id/hide",
    requireUser(db),
    requireRole(db, "admin"),
    (req, res) => {
      try {
        const kudos = hideKudos(db, {
          kudosId: Number(req.params.id),
          moderatorId: req.currentUser.id,
          reason: req.body.reason,
        });
        res.json({ kudos });
      } catch (err) {
        if (err instanceof ValidationError) {
          return res.status(err.status === 400 ? 404 : err.status).json({
            error: { code: err.code, message: err.message },
          });
        }
        res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
      }
    }
  );

  // PATCH /api/admin/kudos/:id/unhide
  app.patch(
    "/api/admin/kudos/:id/unhide",
    requireUser(db),
    requireRole(db, "admin"),
    (req, res) => {
      try {
        const kudos = unhideKudos(db, { kudosId: Number(req.params.id) });
        res.json({ kudos });
      } catch (err) {
        if (err instanceof ValidationError) {
          return res.status(404).json({ error: { code: err.code, message: err.message } });
        }
        res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
      }
    }
  );

  // DELETE /api/admin/kudos/:id
  app.delete(
    "/api/admin/kudos/:id",
    requireUser(db),
    requireRole(db, "admin"),
    (req, res) => {
      try {
        const result = deleteKudos(db, { kudosId: Number(req.params.id) });
        res.json(result);
      } catch (err) {
        if (err instanceof ValidationError) {
          return res.status(404).json({ error: { code: err.code, message: err.message } });
        }
        res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
      }
    }
  );

  return app;
}

function main() {
  const db = createDatabase();
  seed(db);
  const app = createApp(db);
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Kudos system listening on http://localhost:${port}`);
  });
}

if (require.main === module) {
  main();
}

module.exports = { createApp };
