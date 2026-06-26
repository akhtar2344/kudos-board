// app.js
// Vanilla JS implementation of the components defined in SPECIFICATION.md:
// UserSwitcher, UserPicker, KudosForm, KudosFeed, AdminModerationPanel.
// No build step / framework — kept simple and readable for an internal tool.

const state = {
  users: [],
  currentUserId: null,
  feedPage: 1,
  feedTotal: 0,
};

function currentUser() {
  return state.users.find((u) => u.id === state.currentUserId);
}

function authHeaders() {
  return state.currentUserId
    ? { "X-User-Id": String(state.currentUserId) }
    : {};
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function timeAgo(isoString) {
  const date = new Date(isoString.replace(" ", "T") + "Z");
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------- UserSwitcher ----------

function renderUserSwitcher() {
  const mount = document.getElementById("userSwitcherMount");
  const user = currentUser();
  mount.innerHTML = `
    <div class="user-switcher">
      <span>Viewing as</span>
      <select id="userSwitcherSelect">
        ${state.users
          .map(
            (u) =>
              `<option value="${u.id}" ${u.id === state.currentUserId ? "selected" : ""}>${escapeHtml(u.name)}</option>`
          )
          .join("")}
      </select>
      ${user && user.is_admin ? '<span class="user-switcher__badge">Admin</span>' : ""}
    </div>
  `;
  document.getElementById("userSwitcherSelect").addEventListener("change", (e) => {
    state.currentUserId = Number(e.target.value);
    onUserChanged();
  });
}

function onUserChanged() {
  renderUserSwitcher();
  renderRecipientPicker();
  loadFeed({ reset: true });
  toggleAdminSection();
}

// ---------- UserPicker (recipient dropdown in KudosForm) ----------

function renderRecipientPicker() {
  const select = document.getElementById("recipientSelect");
  const others = state.users.filter((u) => u.id !== state.currentUserId);
  select.innerHTML = others
    .map((u) => `<option value="${u.id}">${escapeHtml(u.name)}</option>`)
    .join("");
}

// ---------- KudosForm ----------

function setupKudosForm() {
  const form = document.getElementById("kudosForm");
  const messageInput = document.getElementById("messageInput");
  const charCount = document.getElementById("charCount");
  const errorBox = document.getElementById("formError");

  messageInput.addEventListener("input", () => {
    charCount.textContent = String(messageInput.value.length);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.hidden = true;

    const recipientId = Number(document.getElementById("recipientSelect").value);
    const message = messageInput.value;

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    try {
      const res = await fetch("/api/kudos", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ recipientId, message }),
      });
      const data = await res.json();

      if (!res.ok) {
        errorBox.textContent = data.error?.message || "Could not send kudos.";
        errorBox.hidden = false;
        return;
      }

      messageInput.value = "";
      charCount.textContent = "0";
      showToast("Kudos sent! 🎉");
      loadFeed({ reset: true });
    } catch (err) {
      errorBox.textContent = "Network error — please try again.";
      errorBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ---------- KudosFeed ----------

function renderKudosCard(item) {
  return `
    <article class="kudos-card">
      <div class="kudos-card__line">
        <span class="kudos-card__names">${escapeHtml(item.sender_name)}</span>
        <span class="kudos-card__arrow">→</span>
        <span class="kudos-card__names">${escapeHtml(item.recipient_name)}</span>
      </div>
      <p class="kudos-card__message">${escapeHtml(item.message)}</p>
      <div class="kudos-card__meta">${timeAgo(item.created_at)}</div>
    </article>
  `;
}

async function loadFeed({ reset = false } = {}) {
  if (reset) state.feedPage = 1;
  const res = await fetch(`/api/kudos?page=${state.feedPage}&pageSize=20`, {
    headers: authHeaders(),
  });
  if (!res.ok) return;
  const data = await res.json();
  state.feedTotal = data.total;

  const list = document.getElementById("feedList");
  const empty = document.getElementById("feedEmpty");
  const loadMoreBtn = document.getElementById("loadMoreBtn");

  if (reset) list.innerHTML = "";

  if (data.items.length === 0 && reset) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    list.insertAdjacentHTML("beforeend", data.items.map(renderKudosCard).join(""));
  }

  const loadedSoFar = state.feedPage * 20;
  loadMoreBtn.hidden = loadedSoFar >= state.feedTotal;
}

// ---------- AdminModerationPanel ----------

function toggleAdminSection() {
  const section = document.getElementById("adminSection");
  const user = currentUser();
  section.hidden = !(user && user.is_admin);
  if (!section.hidden) loadAdminList();
}

function renderAdminRow(item) {
  const isHidden = !item.is_visible;
  return `
    <div class="admin-row ${isHidden ? "admin-row--hidden" : ""}" data-id="${item.id}">
      <div class="admin-row__content">
        <div>
          <strong>${escapeHtml(item.sender_name)}</strong> → <strong>${escapeHtml(item.recipient_name)}</strong>
          <span class="admin-row__status ${isHidden ? "admin-row__status--hidden" : "admin-row__status--visible"}">
            ${isHidden ? "Hidden" : "Visible"}
          </span>
        </div>
        <div>${escapeHtml(item.message)}</div>
        <div class="kudos-card__meta">
          ${timeAgo(item.created_at)}
          ${isHidden && item.moderated_by_name ? ` · hidden by ${escapeHtml(item.moderated_by_name)}${item.reason_for_moderation ? `: "${escapeHtml(item.reason_for_moderation)}"` : ""}` : ""}
        </div>
      </div>
      <div class="admin-row__actions">
        ${
          isHidden
            ? `<button class="btn btn--ghost" data-action="unhide" data-id="${item.id}">Unhide</button>`
            : `<button class="btn btn--ghost" data-action="hide" data-id="${item.id}">Hide</button>`
        }
        <button class="btn btn--danger" data-action="delete" data-id="${item.id}">Delete</button>
      </div>
    </div>
  `;
}

async function loadAdminList() {
  const res = await fetch("/api/admin/kudos", { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById("adminList").innerHTML = data.items.map(renderAdminRow).join("");
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "hide") {
    const reason = window.prompt("Optional reason for hiding this kudos:") || "";
    await fetch(`/api/admin/kudos/${id}/hide`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reason }),
    });
    showToast("Kudos hidden.");
    loadAdminList();
    loadFeed({ reset: true });
  } else if (action === "unhide") {
    await fetch(`/api/admin/kudos/${id}/unhide`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    showToast("Kudos unhidden.");
    loadAdminList();
    loadFeed({ reset: true });
  } else if (action === "delete") {
    if (!window.confirm("Permanently delete this kudos? This cannot be undone.")) return;
    await fetch(`/api/admin/kudos/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    showToast("Kudos deleted.");
    loadAdminList();
    loadFeed({ reset: true });
  }
});

document.getElementById("refreshFeedBtn").addEventListener("click", () => loadFeed({ reset: true }));
document.getElementById("loadMoreBtn").addEventListener("click", () => {
  state.feedPage += 1;
  loadFeed({ reset: false });
});

// ---------- Utilities ----------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str ?? "");
  return div.innerHTML;
}

// ---------- Bootstrap ----------

async function init() {
  const res = await fetch("/api/users");
  const data = await res.json();
  state.users = data.users;
  state.currentUserId = state.users[0]?.id ?? null;

  renderUserSwitcher();
  renderRecipientPicker();
  setupKudosForm();
  toggleAdminSection();
  loadFeed({ reset: true });
}

init();
