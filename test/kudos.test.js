// test/kudos.test.js
// Unit tests for the kudos validation/business logic (src/kudos.js),
// run against a temporary in-memory-equivalent SQLite DB per the
// testing strategy in SPECIFICATION.md.
//
// Run with: node --test test/kudos.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createDatabase } = require("../src/db");
const { seed } = require("../src/seed");
const {
  ValidationError,
  createKudos,
  isDuplicateSubmission,
  getPublicFeed,
  hideKudos,
  unhideKudos,
  deleteKudos,
} = require("../src/kudos");

function freshDb() {
  const dbPath = path.join(os.tmpdir(), `kudos-test-${Date.now()}-${Math.random()}.db`);
  const db = createDatabase(dbPath);
  seed(db);
  return { db, dbPath };
}

function cleanup(dbPath) {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

test("createKudos succeeds with valid input", () => {
  const { db, dbPath } = freshDb();
  try {
    const kudos = createKudos(db, { senderId: 1, recipientId: 2, message: "Nice work!" });
    assert.equal(kudos.sender_id, 1);
    assert.equal(kudos.recipient_id, 2);
    assert.equal(kudos.message, "Nice work!");
    assert.equal(kudos.is_visible, 1);
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("createKudos rejects self-kudos", () => {
  const { db, dbPath } = freshDb();
  try {
    assert.throws(
      () => createKudos(db, { senderId: 1, recipientId: 1, message: "self praise" }),
      (err) => err instanceof ValidationError && err.code === "SELF_KUDOS"
    );
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("createKudos rejects empty/whitespace-only message", () => {
  const { db, dbPath } = freshDb();
  try {
    assert.throws(
      () => createKudos(db, { senderId: 1, recipientId: 2, message: "   " }),
      (err) => err instanceof ValidationError && err.code === "EMPTY_MESSAGE"
    );
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("createKudos rejects message over 500 characters", () => {
  const { db, dbPath } = freshDb();
  try {
    const longMessage = "a".repeat(501);
    assert.throws(
      () => createKudos(db, { senderId: 1, recipientId: 2, message: longMessage }),
      (err) => err instanceof ValidationError && err.code === "MESSAGE_TOO_LONG"
    );
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("createKudos accepts a message at exactly 500 characters", () => {
  const { db, dbPath } = freshDb();
  try {
    const exactMessage = "a".repeat(500);
    const kudos = createKudos(db, { senderId: 1, recipientId: 2, message: exactMessage });
    assert.equal(kudos.message.length, 500);
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("createKudos rejects an unknown recipient", () => {
  const { db, dbPath } = freshDb();
  try {
    assert.throws(
      () => createKudos(db, { senderId: 1, recipientId: 9999, message: "hi" }),
      (err) => err instanceof ValidationError && err.code === "RECIPIENT_NOT_FOUND"
    );
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("createKudos rejects an identical duplicate within the time window", () => {
  const { db, dbPath } = freshDb();
  try {
    createKudos(db, { senderId: 1, recipientId: 2, message: "great job" });
    assert.throws(
      () => createKudos(db, { senderId: 1, recipientId: 2, message: "great job" }),
      (err) => err instanceof ValidationError && err.code === "DUPLICATE_SUBMISSION"
    );
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("createKudos allows the same sender to message a DIFFERENT recipient with the same text", () => {
  const { db, dbPath } = freshDb();
  try {
    createKudos(db, { senderId: 1, recipientId: 2, message: "great job" });
    // Different recipient -> not a duplicate, should succeed.
    const kudos = createKudos(db, { senderId: 1, recipientId: 3, message: "great job" });
    assert.equal(kudos.recipient_id, 3);
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("createKudos allows a DIFFERENT message to the same recipient", () => {
  const { db, dbPath } = freshDb();
  try {
    createKudos(db, { senderId: 1, recipientId: 2, message: "great job" });
    const kudos = createKudos(db, { senderId: 1, recipientId: 2, message: "thanks again!" });
    assert.equal(kudos.message, "thanks again!");
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("isDuplicateSubmission returns false outside the time window", () => {
  const { db, dbPath } = freshDb();
  try {
    // Insert a kudos with an artificially old timestamp (outside the 5-min window).
    db.prepare(
      `INSERT INTO kudos (sender_id, recipient_id, message, created_at)
       VALUES (?, ?, ?, datetime('now', '-10 minutes'))`
    ).run(1, 2, "old message");

    const isDup = isDuplicateSubmission(db, {
      senderId: 1,
      recipientId: 2,
      message: "old message",
    });
    assert.equal(isDup, false);
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("getPublicFeed excludes hidden kudos", () => {
  const { db, dbPath } = freshDb();
  try {
    const k1 = createKudos(db, { senderId: 1, recipientId: 2, message: "visible one" });
    const k2 = createKudos(db, { senderId: 2, recipientId: 3, message: "to hide" });

    hideKudos(db, { kudosId: k2.id, moderatorId: 1, reason: "spam" });

    const feed = getPublicFeed(db);
    const messages = feed.items.map((i) => i.message);
    assert.ok(messages.includes("visible one"));
    assert.ok(!messages.includes("to hide"));
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("hideKudos records moderator, timestamp, and reason", () => {
  const { db, dbPath } = freshDb();
  try {
    const k = createKudos(db, { senderId: 1, recipientId: 2, message: "moderate me" });
    const hidden = hideKudos(db, { kudosId: k.id, moderatorId: 1, reason: "inappropriate" });
    assert.equal(hidden.is_visible, 0);
    assert.equal(hidden.moderated_by, 1);
    assert.equal(hidden.reason_for_moderation, "inappropriate");
    assert.ok(hidden.moderated_at);
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("unhideKudos clears moderation fields and restores visibility", () => {
  const { db, dbPath } = freshDb();
  try {
    const k = createKudos(db, { senderId: 1, recipientId: 2, message: "moderate me" });
    hideKudos(db, { kudosId: k.id, moderatorId: 1, reason: "test" });
    const restored = unhideKudos(db, { kudosId: k.id });
    assert.equal(restored.is_visible, 1);
    assert.equal(restored.moderated_by, null);
    assert.equal(restored.reason_for_moderation, null);
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("deleteKudos permanently removes the record", () => {
  const { db, dbPath } = freshDb();
  try {
    const k = createKudos(db, { senderId: 1, recipientId: 2, message: "delete me" });
    const result = deleteKudos(db, { kudosId: k.id });
    assert.equal(result.deleted, true);

    const feed = getPublicFeed(db);
    assert.ok(!feed.items.some((i) => i.id === k.id));
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("hideKudos throws on a non-existent kudos id", () => {
  const { db, dbPath } = freshDb();
  try {
    assert.throws(
      () => hideKudos(db, { kudosId: 99999, moderatorId: 1, reason: "n/a" }),
      (err) => err instanceof ValidationError && err.code === "KUDOS_NOT_FOUND"
    );
  } finally {
    db.close();
    cleanup(dbPath);
  }
});

test("getPublicFeed paginates correctly", () => {
  const { db, dbPath } = freshDb();
  try {
    // Create 5 kudos from different sender/recipient pairs to avoid
    // triggering the duplicate-submission check.
    const pairs = [
      [1, 2], [2, 3], [3, 4], [4, 5], [5, 1],
    ];
    pairs.forEach(([s, r], i) => {
      createKudos(db, { senderId: s, recipientId: r, message: `msg ${i}` });
    });

    const page1 = getPublicFeed(db, { page: 1, pageSize: 2 });
    const page2 = getPublicFeed(db, { page: 2, pageSize: 2 });

    assert.equal(page1.items.length, 2);
    assert.equal(page2.items.length, 2);
    assert.equal(page1.total, 5);
    // Ensure no overlap between pages.
    const page1Ids = page1.items.map((i) => i.id);
    const page2Ids = page2.items.map((i) => i.id);
    assert.ok(!page1Ids.some((id) => page2Ids.includes(id)));
  } finally {
    db.close();
    cleanup(dbPath);
  }
});
