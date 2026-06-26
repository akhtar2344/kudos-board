// src/kudos.js
// Core kudos business logic: validation, duplicate-submission detection,
// and data access. Kept separate from the Express routes so it can be
// unit tested without spinning up an HTTP server (see test/ directory).

const MAX_MESSAGE_LENGTH = 500;
const DUPLICATE_WINDOW_MINUTES = 5;

class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.status = 400;
  }
}

/**
 * Validates a kudos submission payload against business rules.
 * Throws ValidationError on failure; callers should catch and translate
 * to an HTTP 400 response.
 */
function validateKudosInput({ senderId, recipientId, message }) {
  if (!senderId || !recipientId) {
    throw new ValidationError("MISSING_FIELDS", "senderId and recipientId are required.");
  }
  if (senderId === recipientId) {
    throw new ValidationError("SELF_KUDOS", "You cannot send a kudos to yourself.");
  }
  const trimmed = (message || "").trim();
  if (trimmed.length === 0) {
    throw new ValidationError("EMPTY_MESSAGE", "Kudos message cannot be empty.");
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(
      "MESSAGE_TOO_LONG",
      `Kudos message exceeds ${MAX_MESSAGE_LENGTH} characters.`
    );
  }
  return trimmed;
}

/**
 * Checks whether an identical kudos (same sender, recipient, message) was
 * submitted within the duplicate-detection window. Returns true if this
 * would be a duplicate submission.
 */
function isDuplicateSubmission(db, { senderId, recipientId, message }) {
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  const row = db
    .prepare(
      `SELECT id FROM kudos
       WHERE sender_id = ? AND recipient_id = ? AND message = ?
         AND created_at >= ?
       LIMIT 1`
    )
    .get(senderId, recipientId, message, cutoff);

  return Boolean(row);
}

function createKudos(db, { senderId, recipientId, message }) {
  const trimmedMessage = validateKudosInput({ senderId, recipientId, message });

  if (isDuplicateSubmission(db, { senderId, recipientId, message: trimmedMessage })) {
    throw new ValidationError(
      "DUPLICATE_SUBMISSION",
      "This kudos looks like a duplicate of one you sent in the last few minutes."
    );
  }

  const recipientExists = db
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(recipientId);
  if (!recipientExists) {
    throw new ValidationError("RECIPIENT_NOT_FOUND", "Recipient does not exist.");
  }

  const result = db
    .prepare(
      `INSERT INTO kudos (sender_id, recipient_id, message)
       VALUES (?, ?, ?)`
    )
    .run(senderId, recipientId, trimmedMessage);

  return getKudosById(db, Number(result.lastInsertRowid));
}

function getKudosById(db, id) {
  return db
    .prepare(
      `SELECT k.*, s.name AS sender_name, r.name AS recipient_name
       FROM kudos k
       JOIN users s ON s.id = k.sender_id
       JOIN users r ON r.id = k.recipient_id
       WHERE k.id = ?`
    )
    .get(id);
}

function getPublicFeed(db, { page = 1, pageSize = 20 } = {}) {
  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT k.id, k.message, k.created_at, s.name AS sender_name, r.name AS recipient_name
       FROM kudos k
       JOIN users s ON s.id = k.sender_id
       JOIN users r ON r.id = k.recipient_id
       WHERE k.is_visible = 1
       ORDER BY k.created_at DESC, k.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(pageSize, offset);

  const total = db
    .prepare("SELECT COUNT(*) AS count FROM kudos WHERE is_visible = 1")
    .get().count;

  return { items: rows, page, pageSize, total };
}

function getAllKudosForModeration(db, { page = 1, pageSize = 50 } = {}) {
  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT k.*, s.name AS sender_name, r.name AS recipient_name,
              m.name AS moderated_by_name
       FROM kudos k
       JOIN users s ON s.id = k.sender_id
       JOIN users r ON r.id = k.recipient_id
       LEFT JOIN users m ON m.id = k.moderated_by
       ORDER BY k.created_at DESC, k.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(pageSize, offset);

  const total = db.prepare("SELECT COUNT(*) AS count FROM kudos").get().count;

  return { items: rows, page, pageSize, total };
}

function hideKudos(db, { kudosId, moderatorId, reason }) {
  const kudos = db.prepare("SELECT id FROM kudos WHERE id = ?").get(kudosId);
  if (!kudos) {
    throw new ValidationError("KUDOS_NOT_FOUND", "Kudos not found.");
  }
  db.prepare(
    `UPDATE kudos
     SET is_visible = 0, moderated_by = ?, moderated_at = datetime('now'), reason_for_moderation = ?
     WHERE id = ?`
  ).run(moderatorId, reason || null, kudosId);
  return getKudosById(db, kudosId);
}

function unhideKudos(db, { kudosId }) {
  const kudos = db.prepare("SELECT id FROM kudos WHERE id = ?").get(kudosId);
  if (!kudos) {
    throw new ValidationError("KUDOS_NOT_FOUND", "Kudos not found.");
  }
  db.prepare(
    `UPDATE kudos
     SET is_visible = 1, moderated_by = NULL, moderated_at = NULL, reason_for_moderation = NULL
     WHERE id = ?`
  ).run(kudosId);
  return getKudosById(db, kudosId);
}

function deleteKudos(db, { kudosId }) {
  const kudos = db.prepare("SELECT id FROM kudos WHERE id = ?").get(kudosId);
  if (!kudos) {
    throw new ValidationError("KUDOS_NOT_FOUND", "Kudos not found.");
  }
  db.prepare("DELETE FROM kudos WHERE id = ?").run(kudosId);
  return { deleted: true, id: kudosId };
}

module.exports = {
  ValidationError,
  MAX_MESSAGE_LENGTH,
  DUPLICATE_WINDOW_MINUTES,
  validateKudosInput,
  isDuplicateSubmission,
  createKudos,
  getKudosById,
  getPublicFeed,
  getAllKudosForModeration,
  hideKudos,
  unhideKudos,
  deleteKudos,
};
