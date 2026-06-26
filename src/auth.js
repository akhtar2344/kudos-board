// src/auth.js
// Simulated authentication layer (see SPECIFICATION.md - Authentication Model).
// There is no real login; the "current user" is supplied by the client via
// the X-User-Id header (set by the UserSwitcher component in the frontend).
// This keeps the AUTHORIZATION logic (role checks) real and testable, even
// though AUTHENTICATION itself is mocked, as called out explicitly in the spec.

function getCurrentUser(db, req) {
  const userId = Number(req.headers["x-user-id"]);
  if (!userId) return null;
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId) || null;
}

function userHasRole(db, userId, roleName) {
  const row = db
    .prepare(
      `SELECT 1 FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.name = ?`
    )
    .get(userId, roleName);
  return Boolean(row);
}

/**
 * Express middleware: attaches req.currentUser, and rejects with 401 if no
 * valid user is identified via the X-User-Id header.
 */
function requireUser(db) {
  return (req, res, next) => {
    const user = getCurrentUser(db, req);
    if (!user) {
      return res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "No valid user session." } });
    }
    req.currentUser = user;
    next();
  };
}

/**
 * Express middleware: requires the current user to hold the given role.
 * Must run after requireUser(). Returns 403 (without leaking which role
 * was required, per SPECIFICATION.md security considerations) if the
 * check fails.
 */
function requireRole(db, roleName) {
  return (req, res, next) => {
    if (!req.currentUser || !userHasRole(db, req.currentUser.id, roleName)) {
      return res
        .status(403)
        .json({ error: { code: "FORBIDDEN", message: "You do not have access to this action." } });
    }
    next();
  };
}

module.exports = { getCurrentUser, userHasRole, requireUser, requireRole };
