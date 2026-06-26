// src/seed.js
// Seeds mock users + roles, simulating an already-authenticated internal
// SSO directory (see SPECIFICATION.md - Authentication Model).
// Safe to run multiple times: it skips seeding if data already exists.

const { createDatabase } = require("./db");

function seed(db) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get();
  if (existing.count > 0) {
    console.log("Seed skipped: users already exist.");
    return;
  }

  const insertUser = db.prepare(
    "INSERT INTO users (name, email) VALUES (?, ?)"
  );
  const insertRole = db.prepare("INSERT INTO roles (name) VALUES (?)");
  const insertUserRole = db.prepare(
    "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)"
  );

  const adminRoleId = Number(insertRole.run("admin").lastInsertRowid);
  const memberRoleId = Number(insertRole.run("member").lastInsertRowid);

  const mockUsers = [
    { name: "Akhtar Widodo", email: "akhtar@datacom.example" },
    { name: "Sam Tan", email: "sam.tan@datacom.example" },
    { name: "Priya Nair", email: "priya.nair@datacom.example" },
    { name: "Wei Chen", email: "wei.chen@datacom.example" },
    { name: "Maria Santos", email: "maria.santos@datacom.example" },
  ];

  const userIds = mockUsers.map((u) => {
    const result = insertUser.run(u.name, u.email);
    return Number(result.lastInsertRowid);
  });

  // Every seeded user gets the "member" role.
  userIds.forEach((id) => insertUserRole.run(id, memberRoleId));

  // First user (Akhtar) is also an admin, so there's an admin account
  // available to test the moderation panel immediately.
  insertUserRole.run(userIds[0], adminRoleId);

  console.log(`Seeded ${userIds.length} users (user id ${userIds[0]} is admin).`);
}

if (require.main === module) {
  const db = createDatabase();
  seed(db);
  db.close();
}

module.exports = { seed };
