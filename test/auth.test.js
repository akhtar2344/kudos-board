// test/auth.test.js
// Integration tests for role-based access control (RBAC) on admin endpoints,
// per the testing strategy in SPECIFICATION.md: "admin vs. non-admin user
// gets 200 vs. 403".
//
// Run with: node --test test/auth.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const { createDatabase } = require("../src/db");
const { seed } = require("../src/seed");
const { createApp } = require("../src/server");

function freshAppOnPort(port) {
  const dbPath = path.join(os.tmpdir(), `kudos-auth-test-${Date.now()}-${Math.random()}.db`);
  const db = createDatabase(dbPath);
  seed(db);
  const app = createApp(db);
  const server = app.listen(port);
  return { server, db, dbPath };
}

function request(port, { method = "GET", path: reqPath, userId, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: reqPath,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(userId ? { "X-User-Id": String(userId) } : {}),
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function cleanup({ server, dbPath }) {
  server.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
}

test("admin (user 1) can access GET /api/admin/kudos -> 200", async () => {
  const ctx = freshAppOnPort(4101);
  try {
    const res = await request(4101, { path: "/api/admin/kudos", userId: 1 });
    assert.equal(res.status, 200);
  } finally {
    cleanup(ctx);
  }
});

test("non-admin (user 2) gets 403 on GET /api/admin/kudos", async () => {
  const ctx = freshAppOnPort(4102);
  try {
    const res = await request(4102, { path: "/api/admin/kudos", userId: 2 });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "FORBIDDEN");
  } finally {
    cleanup(ctx);
  }
});

test("request with no X-User-Id header gets 401 on a protected route", async () => {
  const ctx = freshAppOnPort(4103);
  try {
    const res = await request(4103, { path: "/api/kudos" });
    assert.equal(res.status, 401);
  } finally {
    cleanup(ctx);
  }
});

test("non-admin gets 403 attempting to hide a kudos", async () => {
  const ctx = freshAppOnPort(4104);
  try {
    const created = await request(4104, {
      method: "POST",
      path: "/api/kudos",
      userId: 2,
      body: { recipientId: 3, message: "hello" },
    });
    const kudosId = created.body.kudos.id;

    const res = await request(4104, {
      method: "PATCH",
      path: `/api/admin/kudos/${kudosId}/hide`,
      userId: 2, // non-admin
      body: { reason: "test" },
    });
    assert.equal(res.status, 403);
  } finally {
    cleanup(ctx);
  }
});

test("admin can hide a kudos -> 200, and it disappears from the public feed", async () => {
  const ctx = freshAppOnPort(4105);
  try {
    const created = await request(4105, {
      method: "POST",
      path: "/api/kudos",
      userId: 2,
      body: { recipientId: 3, message: "to be hidden" },
    });
    const kudosId = created.body.kudos.id;

    const hideRes = await request(4105, {
      method: "PATCH",
      path: `/api/admin/kudos/${kudosId}/hide`,
      userId: 1, // admin
      body: { reason: "inappropriate" },
    });
    assert.equal(hideRes.status, 200);

    const feedRes = await request(4105, { path: "/api/kudos", userId: 1 });
    const messages = feedRes.body.items.map((i) => i.message);
    assert.ok(!messages.includes("to be hidden"));
  } finally {
    cleanup(ctx);
  }
});

test("non-admin gets 403 attempting to delete a kudos", async () => {
  const ctx = freshAppOnPort(4106);
  try {
    const created = await request(4106, {
      method: "POST",
      path: "/api/kudos",
      userId: 2,
      body: { recipientId: 3, message: "delete attempt" },
    });
    const kudosId = created.body.kudos.id;

    const res = await request(4106, {
      method: "DELETE",
      path: `/api/admin/kudos/${kudosId}`,
      userId: 2,
    });
    assert.equal(res.status, 403);
  } finally {
    cleanup(ctx);
  }
});
