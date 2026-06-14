const app = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");
const toastRoot = document.getElementById("toast");

const state = {
  user: null,
  ownerExists: true,
  settings: null,
  masterData: null,
  searchTimer: null,
  sidebarEscapeBound: false,
  sidebarResizeBound: false,
  sidebarCollapsed: false
};

const navItems = [
  ["dashboard", "Dashboard"],
  ["products", "Products"],
  ["inventory", "Inventory"],
  ["production", "Production / Assembly"],
  ["suppliers", "Suppliers"],
  ["purchases", "Purchases"],
  ["invoices", "Invoices"],
  ["payments", "Payments"],
  ["customers", "Customers"],
  ["expenses", "Expenses"],
  ["reports", "Reports"],
  ["notifications", "Notifications"],
  ["settings", "Settings"],
  ["backup", "Backup"],
  ["recycle", "Recycle Bin"],
  ["activity", "Activity Logs"],
  ["profile", "Profile"]
];

const itemTypeOptions = [
  { value: "FINISHED_PRODUCT", label: "Finished Product" },
  { value: "RAW_MATERIAL", label: "Raw Material" },
  { value: "SPARE_PART", label: "Spare Part / Accessory" },
  { value: "SERVICE", label: "Service" }
];

const unitOptions = ["piece", "set", "kg", "gram", "meter", "foot", "liter", "box", "sheet", "roll", "pack", "other"].map((unit) => ({ value: unit, label: unit }));

function displayItemType(value) {
  return (state.masterData?.itemTypes || itemTypeOptions).find((item) => item.value === value)?.label || itemTypeOptions.find((item) => item.value === value)?.label || value || "";
}

function itemTypeOption(value) {
  const normalized = String(value || "").toUpperCase();
  return (state.masterData?.itemTypes || []).find((item) => String(item.value || "").toUpperCase() === normalized) || itemTypeOptions.find((item) => item.value === normalized) || null;
}

function itemTypeBehavior(value) {
  const record = itemTypeOption(value)?.record || {};
  const defaults = {
    FINISHED_PRODUCT: { canTrackInventory: true, canBeSold: true, canBePurchased: true, canBeProduced: true, canBeUsedInProduction: false, canHaveBillOfMaterials: true, appearsInInvoices: true, appearsInPurchases: true, requiresCostPrice: true, requiresSellingPrice: true, defaultUnitOfMeasure: "piece" },
    RAW_MATERIAL: { canTrackInventory: true, canBeSold: false, canBePurchased: true, canBeProduced: false, canBeUsedInProduction: true, canHaveBillOfMaterials: false, appearsInInvoices: false, appearsInPurchases: true, requiresCostPrice: true, requiresSellingPrice: false, defaultUnitOfMeasure: "piece" },
    SPARE_PART: { canTrackInventory: true, canBeSold: true, canBePurchased: true, canBeProduced: false, canBeUsedInProduction: true, canHaveBillOfMaterials: false, appearsInInvoices: true, appearsInPurchases: true, requiresCostPrice: true, requiresSellingPrice: true, defaultUnitOfMeasure: "piece" },
    SERVICE: { canTrackInventory: false, canBeSold: true, canBePurchased: false, canBeProduced: false, canBeUsedInProduction: false, canHaveBillOfMaterials: false, appearsInInvoices: true, appearsInPurchases: false, requiresCostPrice: false, requiresSellingPrice: true, defaultUnitOfMeasure: "service" }
  }[String(value || "FINISHED_PRODUCT").toUpperCase()] || { canTrackInventory: true, canBeSold: true, canBePurchased: true, canBeProduced: false, canBeUsedInProduction: false, canHaveBillOfMaterials: false, appearsInInvoices: true, appearsInPurchases: true, requiresCostPrice: false, requiresSellingPrice: false, defaultUnitOfMeasure: "piece" };
  const booleanFields = ["canTrackInventory", "canBeSold", "canBePurchased", "canBeProduced", "canBeUsedInProduction", "canHaveBillOfMaterials", "appearsInInvoices", "appearsInPurchases", "affectsInventoryOnInvoice", "affectsInventoryOnPurchase", "requiresCostPrice", "requiresSellingPrice"];
  const behavior = { ...defaults };
  booleanFields.forEach((field) => {
    if (record[field] !== undefined) behavior[field] = record[field] === true || record[field] === "true";
  });
  behavior.defaultUnitOfMeasure = record.defaultUnitOfMeasure || behavior.defaultUnitOfMeasure || "piece";
  return behavior;
}

function stockBadge(row) {
  if (!row.trackInventory) return badge("Not Tracked");
  return badge(row.stock?.status || row.stockStatus || "OUT_OF_STOCK");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  const currency = state.settings?.currency || "PKR";
  return `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function inputNumber(value) {
  const number = numberValue(value);
  return number ? String(Math.round(number * 100) / 100) : "";
}

function date(value) {
  return value ? String(value).slice(0, 10) : "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthStart() {
  return `${today().slice(0, 7)}-01`;
}

function badge(value) {
  const text = escapeHtml(value || "active");
  const lowered = text.toLowerCase();
  let type = "";
  if (["paid", "completed", "active", "success"].includes(lowered)) type = "success";
  if (["pending", "partial", "scheduled", "unpaid"].includes(lowered)) type = "warning";
  if (["cancelled", "archived", "failed", "overdue"].includes(lowered)) type = "danger";
  return `<span class="badge ${type}">${text}</span>`;
}

function toast(message) {
  const item = document.createElement("div");
  item.className = "toast-item";
  item.textContent = message;
  toastRoot.appendChild(item);
  setTimeout(() => item.remove(), 3600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof data === "string" ? data : data.message || "Request failed.";
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function setContent(html) {
  const target = document.querySelector("[data-content]");
  if (target) target.innerHTML = html;
}

function pageShell(title, subtitle, actions = "", body = `<div class="loading">Loading ${escapeHtml(title)}...</div>`) {
  return `
    <section class="page-head">
      <div>
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <p class="page-subtitle">${escapeHtml(subtitle)}</p>
      </div>
      <div class="actions">${actions}</div>
    </section>
    ${body}
  `;
}

function emptyState(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function errorState(error) {
  return `<div class="error">${escapeHtml(error.message || error)}</div>`;
}

function renderStartupError(error) {
  console.error("DawnGas initialization failed", error);
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-panel">
        <div class="auth-brand">${escapeHtml(state.settings?.businessName || "DawnGas")}</div>
        <h1>DawnGas could not load.</h1>
        <p>Please refresh or contact the administrator.</p>
      </section>
      <section class="auth-card">
        <h2>Startup error</h2>
        <div class="error">The application could not initialize safely.</div>
        <button class="button primary" type="button" data-reload-app>Refresh</button>
      </section>
    </main>
  `;
  document.querySelector("[data-reload-app]")?.addEventListener("click", () => window.location.reload());
}

function table(headers, rows, emptyMessage = "No records yet.") {
  if (!rows || rows.length === 0) return emptyState(emptyMessage);
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  ${headers
                    .map((header) => {
                      const value = typeof header.value === "function" ? header.value(row) : row[header.value];
                      return `<td>${value ?? ""}</td>`;
                    })
                    .join("")}
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formInput(name, label, value = "", type = "text", extra = "") {
  return `
    <div class="field">
      <label for="${name}">${escapeHtml(label)}</label>
      <input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}>
    </div>
  `;
}

function formTextarea(name, label, value = "", extra = "") {
  return `
    <div class="field wide">
      <label for="${name}">${escapeHtml(label)}</label>
      <textarea id="${name}" name="${name}" ${extra}>${escapeHtml(value)}</textarea>
    </div>
  `;
}

function formSelect(name, label, options, selected = "") {
  return `
    <div class="field">
      <label for="${name}">${escapeHtml(label)}</label>
      <select id="${name}" name="${name}">
        ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(selected) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
      </select>
    </div>
  `;
}

function formToggle(name, label, checked = false, helper = "") {
  return `
    <label class="toggle-field" for="${name}">
      <input type="hidden" name="${name}" value="false">
      <input id="${name}" name="${name}" type="checkbox" value="true" ${checked ? "checked" : ""}>
      <span class="toggle-control" aria-hidden="true"></span>
      <span><strong>${escapeHtml(label)}</strong>${helper ? `<small>${escapeHtml(helper)}</small>` : ""}</span>
    </label>
  `;
}

function formSection(title, body, helper = "") {
  return `
    <section class="form-section">
      <div class="form-section-head">
        <h4>${escapeHtml(title)}</h4>
        ${helper ? `<p>${escapeHtml(helper)}</p>` : ""}
      </div>
      <div class="form-grid">${body}</div>
    </section>
  `;
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function queryParams(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function openModal(title, body, onSubmit, submitLabel = "Save") {
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-head">
          <h3>${escapeHtml(title)}</h3>
          <button class="icon-button modal-close" data-close-modal aria-label="Close dialog">Close</button>
        </div>
        <form data-modal-form>
          <div class="modal-body">${body}</div>
          <div class="modal-foot">
            <button type="button" class="button ghost" data-close-modal>Cancel</button>
            <button type="submit" class="button primary">${escapeHtml(submitLabel)}</button>
          </div>
        </form>
      </div>
    </div>
  `;
  modalRoot.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));
  modalRoot.querySelector("[data-modal-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector("button[type='submit']");
    submit.disabled = true;
    submit.textContent = "Saving...";
    try {
      const result = await onSubmit(event.currentTarget);
      if (result?.keepOpen) {
        if (modalRoot.contains(submit)) {
          submit.disabled = false;
          submit.textContent = submitLabel;
        }
        return;
      }
      closeModal();
      if (result?.toast !== false) toast(result?.toast || "Saved.");
      if (result?.refresh !== false) await renderRoute();
    } catch (error) {
      toast(error.message);
      submit.disabled = false;
      submit.textContent = submitLabel;
    }
  });
}

function openInfoModal(title, body, closeLabel = "Close") {
  modalRoot.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-head">
          <h3>${escapeHtml(title)}</h3>
          <button class="icon-button modal-close" data-close-modal aria-label="Close dialog">Close</button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">
          <button type="button" class="button primary" data-close-modal>${escapeHtml(closeLabel)}</button>
        </div>
      </div>
    </div>
  `;
  modalRoot.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModal));
}

function confirmAction(message, onConfirm, options = {}) {
  openModal(
    options.title || "Confirm action",
    `<p class="${options.danger ? "danger-copy" : ""}">${escapeHtml(message)}</p>`,
    async () => {
      return await onConfirm();
    },
    options.submitLabel || "Confirm"
  );
  if (options.danger) {
    const submit = modalRoot.querySelector("button[type='submit']");
    submit?.classList.remove("primary");
    submit?.classList.add("danger");
  }
}

function dependencySummaryHtml(dependencies = []) {
  if (!dependencies.length) return `<div class="empty compact">No dependency details were returned.</div>`;
  return `
    <ul class="dependency-list">
      ${dependencies.map((item) => `<li><span>${escapeHtml(item.type)}</span><strong>${escapeHtml(item.count)}</strong></li>`).join("")}
    </ul>
  `;
}

function showCannotDeleteRecordModal(data = {}) {
  openInfoModal(
    "Cannot Delete Record",
    `
      <div class="dependency-warning">
        <h4>This record is connected to business history and cannot be permanently deleted.</h4>
        <p>${escapeHtml(data.message || "Permanent delete is blocked because this item is connected to business history.")}</p>
      </div>
      <h4 class="section-mini-title">Linked records</h4>
      ${dependencySummaryHtml(data.dependencies || [])}
      <h4 class="section-mini-title">Suggested actions</h4>
      <ul class="suggested-actions">
        <li>Keep the record archived.</li>
        <li>Restore the record if you need to use it again.</li>
        <li>Create a new corrected record instead of deleting business history.</li>
      </ul>
    `,
    "Close"
  );
}

function confirmPermanentDelete(type, id) {
  confirmAction(
    "Permanently deleting this record cannot be undone. If this record is linked to invoices, payments, purchases, production, or inventory history, deletion may be blocked to protect business records.",
    async () => {
      try {
        await api(`/api/recycle-bin/${type}/${id}/permanent`, { method: "DELETE", body: {} });
      } catch (error) {
        if (error.status === 409) {
          showCannotDeleteRecordModal(error.data || { message: error.message });
          return { keepOpen: true };
        }
        throw error;
      }
    },
    { title: "Delete permanently?", submitLabel: "Delete Permanently", danger: true }
  );
}

async function init() {
  try {
    const exists = await api("/api/auth/owner-exists");
    state.ownerExists = exists.exists;
    await loadSettings();
    await loadMasterData();
    const me = await api("/api/auth/me");
    state.user = me.user;
    renderShell();
    await renderRoute();
  } catch {
    await loadSettings();
    await loadMasterData();
    renderAuth();
  }
}

async function loadSettings() {
  try {
    const result = await api("/api/settings/branding");
    state.settings = result.settings;
    applyTheme(result.settings);
  } catch {
    state.settings = { businessName: "DawnGas", currency: "PKR" };
  }
}

async function loadMasterData(includeArchived = false) {
  try {
    const result = await api(`/api/master-data${includeArchived ? "?includeArchived=true" : ""}`);
    state.masterData = Object.fromEntries(
      Object.entries(result.masterData || {}).map(([type, rows]) => [
        type,
        rows.map((row) => ({ value: row.value, label: row.label, description: row.description, record: row }))
      ])
    );
  } catch {
    state.masterData = state.masterData || {};
  }
  return state.masterData;
}

async function masterOptions(type, fallback = [], includeArchived = false) {
  if (!state.masterData || includeArchived) await loadMasterData(includeArchived);
  const rows = state.masterData?.[type] || [];
  const options = rows.length ? rows : fallback;
  return options.map((item) => ({
    value: item.value,
    label: item.label || item.value,
    description: item.description || "",
    record: item.record || item
  }));
}

function applyTheme(settings = {}) {
  const root = document.documentElement;
  const values = {
    "--color-primary": settings.primaryColor || "#13756D",
    "--color-primary-hover": settings.primaryHoverColor || "#0F5F58",
    "--color-secondary": settings.secondaryColor || "#0F172A",
    "--color-accent": settings.accentColor || "#F59E0B",
    "--color-sidebar-bg": settings.sidebarBackgroundColor || "#0F1A24",
    "--color-sidebar-active": settings.sidebarActiveColor || "#1F2D3A",
    "--color-button-text": settings.buttonTextColor || "#FFFFFF",
    "--color-page-bg": settings.pageBackgroundColor || "#F7FAFC",
    "--color-card-bg": settings.cardBackgroundColor || "#FFFFFF"
  };
  Object.entries(values).forEach(([key, value]) => root.style.setProperty(key, value));
  root.style.setProperty("--primary", values["--color-primary"]);
  root.style.setProperty("--primary-dark", values["--color-primary-hover"]);
  root.style.setProperty("--accent", values["--color-accent"]);
  root.style.setProperty("--bg", values["--color-page-bg"]);
  root.style.setProperty("--surface", values["--color-card-bg"]);
}

function brandLogo(maxHeight = 40) {
  const settings = state.settings || {};
  if (settings.logoUrl) {
    return `<img class="brand-logo-img" src="${escapeHtml(settings.logoUrl)}" alt="${escapeHtml(settings.businessName || "DawnGas")}" style="max-height:${maxHeight}px">`;
  }
  return `<span>${escapeHtml(settings.businessName || "DawnGas")}</span>`;
}

function sidebarBrandMarkup() {
  const settings = state.settings || {};
  if (settings.logoUrl) {
    return `
      <div class="brand-identity">
        <div class="brand-logo-only">${brandLogo(44)}</div>
        ${settings.sidebarBrandMode === "logo_name" ? `<div class="brand-text">${escapeHtml(settings.businessName || "DawnGas")}</div>` : ""}
      </div>
    `;
  }
  return `<div class="brand-fallback">${escapeHtml(settings.businessName || "DawnGas")}</div>`;
}

function isDrawerSidebar() {
  return window.matchMedia("(max-width: 980px)").matches;
}

function updateSidebarToggleState() {
  const toggle = document.querySelector("[data-toggle-sidebar]");
  if (!toggle) return;
  const drawer = isDrawerSidebar();
  const open = document.body.classList.contains("sidebar-open");
  const collapsed = state.sidebarCollapsed && !drawer;
  const label = drawer ? "Toggle menu" : collapsed ? "Expand sidebar" : "Collapse sidebar";
  toggle.setAttribute("aria-label", label);
  toggle.setAttribute("title", label);
  toggle.setAttribute("aria-expanded", drawer ? (open ? "true" : "false") : (!collapsed ? "true" : "false"));
}

function applySidebarCollapsed() {
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed && !isDrawerSidebar());
  updateSidebarToggleState();
}

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = collapsed;
  applySidebarCollapsed();
}

function setSidebarOpen(open) {
  const sidebar = document.querySelector("[data-sidebar]");
  if (!sidebar) return;
  const drawer = isDrawerSidebar();
  sidebar.classList.toggle("open", drawer && open);
  document.body.classList.toggle("sidebar-open", drawer && open);
  updateSidebarToggleState();
}

function toggleSidebar() {
  const sidebar = document.querySelector("[data-sidebar]");
  if (isDrawerSidebar()) {
    setSidebarOpen(!sidebar?.classList.contains("open"));
  } else {
    setSidebarOpen(false);
    setSidebarCollapsed(!state.sidebarCollapsed);
  }
}

function closeSidebar() {
  setSidebarOpen(false);
}

function ownerExistsPrompt() {
  return `
    <div class="grid">
      <div class="empty">
        <h2 style="margin-top:0;color:var(--text);">Owner account already exists</h2>
        <p>This DawnGas system already has an owner account. Please log in to continue.</p>
      </div>
      <button class="button primary" type="button" data-auth-mode="login">Go to Login</button>
      <button class="button ghost" type="button" data-auth-mode="login">Already have an account? Login</button>
    </div>
  `;
}

function renderAuth(mode = state.ownerExists ? "login" : "setup") {
  const setup = mode === "setup";
  const forgot = mode === "forgot";
  const reset = mode === "reset";
  const blockedSetup = setup && state.ownerExists;
  const title = setup ? "Create owner account" : forgot ? "Reset access" : reset ? "Set new password" : "Owner login";
  const summary = setup
    ? "DawnGas allows one owner account. After setup, public signup closes automatically."
    : "Secure access for the business owner only. No staff accounts or public dashboards.";
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-panel">
        <div class="auth-brand">${brandLogo(60)}</div>
        <h1>Run the gas business from one secure dashboard.</h1>
        <p>${summary}</p>
      </section>
      <section class="auth-card">
        ${
          blockedSetup
            ? ownerExistsPrompt()
            : `<h2>${title}</h2>
        <form data-auth-form class="grid">
          ${
            setup
              ? `
                ${formInput("name", "Owner name", "", "text", "required")}
                ${formInput("email", "Email", "", "email", "required")}
                ${formInput("phone", "Phone", "", "text", "required")}
                ${formInput("password", "Password", "", "password", "required minlength='8'")}
                ${formInput("confirmPassword", "Confirm password", "", "password", "required minlength='8'")}
              `
              : forgot
                ? formInput("email", "Email", "", "email", "required")
                : reset
                  ? `
                    ${formInput("token", "Reset token", "", "text", "required")}
                    ${formInput("password", "New password", "", "password", "required minlength='8'")}
                  `
                  : `
                    ${formInput("email", "Email", "", "email", "required")}
                    ${formInput("password", "Password", "", "password", "required")}
                  `
          }
          <button class="button primary" type="submit">${setup ? "Create owner" : forgot ? "Create reset token" : reset ? "Reset password" : "Login"}</button>
        </form>
        <div class="actions" style="margin-top: 14px;">
          ${state.ownerExists && !setup ? `<button class="button ghost" data-auth-mode="forgot">Forgot password</button>` : ""}
          ${setup ? `<button class="button ghost" data-auth-mode="login">Already have an account? Login</button>` : ""}
          ${forgot ? `<button class="button ghost" data-auth-mode="reset">I have a reset token</button>` : ""}
          ${(forgot || reset) ? `<button class="button ghost" data-auth-mode="login">Back to login</button>` : ""}
          ${!state.ownerExists && !setup ? `<button class="button ghost" data-auth-mode="setup">Owner setup</button>` : ""}
        </div>`
        }
      </section>
    </main>
  `;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => renderAuth(button.dataset.authMode));
  });
  const authForm = document.querySelector("[data-auth-form]");
  if (!authForm) return;
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    try {
      if (setup) {
        if (values.password !== values.confirmPassword) throw new Error("Passwords do not match.");
        const result = await api("/api/auth/signup", { method: "POST", body: values });
        state.user = result.user;
      } else if (forgot) {
        const result = await api("/api/auth/forgot-password", { method: "POST", body: values });
        toast(result.devResetToken ? `Development reset token: ${result.devResetToken}` : result.message);
        renderAuth("reset");
        return;
      } else if (reset) {
        await api("/api/auth/reset-password", { method: "POST", body: values });
        toast("Password reset. Please log in.");
        renderAuth("login");
        return;
      } else {
        const result = await api("/api/auth/login", { method: "POST", body: values });
        state.user = result.user;
      }
      await loadSettings();
      await loadMasterData();
      renderShell();
      await renderRoute();
    } catch (error) {
      toast(error.message);
      if (setup && error.message.toLowerCase().includes("owner account already exists")) {
        state.ownerExists = true;
        renderAuth("setup");
      }
    }
  });
}

function renderShell() {
  app.innerHTML = `
    <div class="layout">
      <div class="sidebar-overlay" data-sidebar-overlay></div>
      <aside class="sidebar" data-sidebar>
        <div class="brand-block">
          ${sidebarBrandMarkup()}
        </div>
        <nav class="nav-list">
          ${navItems.map(([key, label]) => `<button class="nav-button" data-route="${key}" title="${escapeHtml(label)}"><span class="nav-dot"></span><span class="nav-label">${escapeHtml(label)}</span></button>`).join("")}
        </nav>
      </aside>
      <main class="main">
        <header class="topbar">
          <button class="icon-button mobile-menu" data-toggle-sidebar aria-label="Open menu" aria-expanded="false"><span class="menu-bars" aria-hidden="true"><span></span><span></span><span></span></span></button>
          <div class="search-box">
            <input data-global-search placeholder="Search customers, products, SKUs, suppliers, invoices, receipts" autocomplete="off">
            <div class="search-results hide" data-search-results></div>
          </div>
          <div class="actions">
            <button class="button" data-logout>Logout</button>
          </div>
        </header>
        <section class="content" data-content></section>
      </main>
    </div>
  `;
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = button.dataset.route;
      if (isDrawerSidebar()) closeSidebar();
    });
  });
  document.querySelector("[data-toggle-sidebar]").addEventListener("click", toggleSidebar);
  document.querySelector("[data-sidebar-overlay]").addEventListener("click", closeSidebar);
  if (!state.sidebarEscapeBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSidebar();
    });
    state.sidebarEscapeBound = true;
  }
  if (!state.sidebarResizeBound) {
    window.addEventListener("resize", () => {
      if (!isDrawerSidebar()) setSidebarOpen(false);
      applySidebarCollapsed();
    });
    state.sidebarResizeBound = true;
  }
  applySidebarCollapsed();
  updateSidebarToggleState();
  document.querySelector("[data-logout]").addEventListener("click", logout);
  setupSearch();
}

function currentRoute() {
  return (location.hash || "#dashboard").replace("#", "") || "dashboard";
}

function setActiveNav() {
  const route = currentRoute();
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === route);
  });
}

async function renderRoute() {
  if (!state.user) return;
  setActiveNav();
  const route = currentRoute();
  const renderer = pageRenderers[route] || pageRenderers.dashboard;
  await renderer();
}

window.addEventListener("hashchange", renderRoute);

function setupSearch() {
  const input = document.querySelector("[data-global-search]");
  const results = document.querySelector("[data-search-results]");
  input.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    const q = input.value.trim();
    if (!q) {
      results.classList.add("hide");
      results.innerHTML = "";
      return;
    }
    state.searchTimer = setTimeout(async () => {
      try {
        const data = await api(`/api/search?q=${encodeURIComponent(q)}`);
        results.innerHTML = data.results.length
          ? data.results
              .map((item) => `<a class="search-result" href="${item.url}"><strong>${escapeHtml(item.type)}</strong><span>${escapeHtml(item.title)}<br><small>${escapeHtml(item.subtitle)}</small></span></a>`)
              .join("")
          : `<div class="search-result"><strong>None</strong><span>No matching records</span></div>`;
        results.classList.remove("hide");
      } catch (error) {
        results.innerHTML = `<div class="search-result"><strong>Error</strong><span>${escapeHtml(error.message)}</span></div>`;
        results.classList.remove("hide");
      }
    }, 250);
  });
}

async function logout() {
  await api("/api/auth/logout", { method: "POST", body: {} });
  state.user = null;
  renderAuth("login");
}

const pageRenderers = {
  dashboard: renderDashboard,
  customers: renderCustomers,
  products: renderProducts,
  inventory: renderInventory,
  production: renderProduction,
  suppliers: renderSuppliers,
  purchases: renderPurchases,
  invoices: renderInvoices,
  orders: renderOrders,
  deliveries: renderDeliveries,
  payments: renderPayments,
  expenses: renderExpenses,
  reports: renderReports,
  notifications: renderNotifications,
  settings: renderSettings,
  backup: renderBackup,
  recycle: renderRecycle,
  activity: renderActivity,
  profile: renderProfile
};

async function renderDashboard() {
  setContent(pageShell("Dashboard", "Real-time owner overview from stored business records.", dashboardActions()));
  try {
    const [summaryData, activityData] = await Promise.all([api("/api/dashboard/summary"), api("/api/dashboard/recent-activity")]);
    const summary = summaryData.summary;
    const metrics = [
      ["Total products", summary.totalProducts, "Finished products, materials, parts, and services"],
      ["Low stock items", summary.lowStockItems, "Items needing attention"],
      ["Raw materials low", summary.rawMaterialsLowStock, "Materials below threshold"],
      ["Finished stock", summary.finishedProductsStock, "Finished product units on hand"],
      ["Invoices today", summary.invoicesToday, "Invoices created today"],
      ["Unpaid invoices", summary.unpaidInvoices, "Invoices still carrying balance"],
      ["Payments today", money(summary.paymentsCollectedToday), "Cash collected today"],
      ["Outstanding balance", money(summary.outstandingBalance), "Customer balances due"],
      ["Purchases month", money(summary.purchasesThisMonth), "Supplier stock purchases"],
      ["Monthly expenses", money(summary.expensesThisMonth), "Expenses this month"],
      ["Estimated profit", money(summary.estimatedProfit), "Sales minus purchases and expenses"]
    ];
    setContent(pageShell("Dashboard", "Real-time owner overview from stored business records.", dashboardActions(), `
      <div class="grid metric-grid">
        ${metrics.map(([label, value, note]) => `<article class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`).join("")}
      </div>
      <div class="split-grid" style="margin-top:14px;">
        <section class="panel">
          <h3>Customer Balance Reminders</h3>
          ${
            summaryData.balanceReminders.length
              ? table(
                  [
                    { label: "Customer", value: (row) => escapeHtml(row.name) },
                    { label: "Phone", value: (row) => escapeHtml(row.phone) },
                    { label: "Balance", value: (row) => `<span class="money">${money(row.balance)}</span>` },
                    { label: "Actions", value: (row) => `<button class="button" data-payment-for="${row.id}">Record payment</button> <button class="button" data-whatsapp-reminder="${row.id}">WhatsApp</button>` }
                  ],
                  summaryData.balanceReminders,
                  "No customer balances due."
                )
              : emptyState("No customer balances due.")
          }
        </section>
        <section class="panel">
          <h3>Recent Inventory Movements</h3>
          ${
            summaryData.recentInventoryMovements?.length
              ? `<div class="detail-list">${summaryData.recentInventoryMovements.slice(0, 8).map((item) => `<div class="detail-row"><span class="label">${escapeHtml(item.movementType)}</span><span>${escapeHtml(item.quantity)} units, ${escapeHtml(date(item.createdAt))}</span></div>`).join("")}</div>`
              : emptyState("Inventory movements will appear after purchases, invoices, or adjustments.")
          }
        </section>
      </div>
      <div class="split-grid" style="margin-top:14px;">
        <section class="panel"><h3>Recent Invoices</h3>${table([{ label: "Invoice", value: "invoiceNumber" }, { label: "Customer", value: (row) => escapeHtml(row.customer?.name || "") }, { label: "Balance", value: (row) => money(row.balanceAmount) }, { label: "Status", value: (row) => badge(row.status) }], summaryData.recentInvoices || [], "No invoices yet.")}</section>
        <section class="panel"><h3>Recent Payments</h3>${table([{ label: "Receipt", value: "receiptNumber" }, { label: "Customer", value: (row) => escapeHtml(row.customer?.name || "") }, { label: "Amount", value: (row) => money(row.amount) }, { label: "Date", value: (row) => date(row.paymentDate) }], summaryData.recentPayments || [], "No payments yet.")}</section>
      </div>
    `));
    bindDashboardActions(summaryData.balanceReminders);
  } catch (error) {
    setContent(pageShell("Dashboard", "Real-time owner overview from stored business records.", dashboardActions(), errorState(error)));
  }
}

function dashboardActions() {
  return `
    <button class="button primary" data-dash-action="invoice">Create Invoice</button>
    <button class="button" data-dash-action="product">Add Product</button>
    <button class="button" data-dash-action="stock">Adjust Stock</button>
    <button class="button" data-dash-action="purchase">Create Purchase</button>
    <button class="button" data-dash-action="production">Create Production Batch</button>
    <button class="button" data-dash-action="expense">Add Expense</button>
    <button class="button" data-dash-action="customer">Add Customer</button>
    <button class="button" data-dash-action="payment">Add Payment</button>
  `;
}

function bindDashboardActions(balanceReminders = []) {
  document.querySelectorAll("[data-dash-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.dashAction === "invoice") return openInvoiceForm();
      if (button.dataset.dashAction === "product") return openProductForm();
      if (button.dataset.dashAction === "stock") return openStockAdjustment();
      if (button.dataset.dashAction === "purchase") return openPurchaseForm();
      if (button.dataset.dashAction === "production") return openProductionForm();
      if (button.dataset.dashAction === "expense") return openExpenseForm();
      if (button.dataset.dashAction === "customer") return openCustomerForm();
      if (button.dataset.dashAction === "payment") return openPaymentForm();
    });
  });
  document.querySelectorAll("[data-payment-for]").forEach((button) => button.addEventListener("click", () => openPaymentForm({ customerId: button.dataset.paymentFor })));
  document.querySelectorAll("[data-whatsapp-reminder]").forEach((button) => {
    button.addEventListener("click", () => {
      const customer = balanceReminders.find((item) => item.id === button.dataset.whatsappReminder);
      openWhatsApp(`${state.settings.businessName || "DawnGas"} reminder: ${customer.name}, your current balance is ${money(customer.balance)}. Please arrange payment when possible.`);
    });
  });
}

async function renderCustomers() {
  setContent(pageShell("Customers", "Manage customer balances, statements, notes, and payment reminders.", `<button class="button primary" data-add-customer>Add Customer</button><button class="button" data-export-customers>Export CSV</button>`));
  try {
    const data = await api("/api/customers");
    setContent(pageShell("Customers", "Manage customer balances, statements, notes, and payment reminders.", `<button class="button primary" data-add-customer>Add Customer</button><button class="button" data-export-customers>Export CSV</button>`, table(
      [
        { label: "Customer", value: (row) => `<strong>${escapeHtml(row.name)}</strong><br><small>${escapeHtml(row.phone)}</small>` },
        { label: "Current Balance", value: (row) => `<span class="money">${money(row.currentBalance ?? row.balance)}</span>` },
        { label: "Invoices", value: "totalInvoices" },
        { label: "Last Invoice", value: (row) => date(row.lastInvoiceAt) },
        { label: "Last Payment", value: (row) => date(row.lastPaymentDate) },
        { label: "Status", value: (row) => badge(row.status) },
        { label: "Actions", value: (row) => customerActions(row) }
      ],
      data.customers,
      "Add your first customer to start tracking balances."
    )));
    document.querySelector("[data-add-customer]").addEventListener("click", () => openCustomerForm());
    document.querySelector("[data-export-customers]").addEventListener("click", () => window.open("/api/exports/customers/csv", "_blank"));
    bindCustomerActions(data.customers);
  } catch (error) {
    setContent(pageShell("Customers", "Manage customer balances, statements, notes, and payment reminders.", "", errorState(error)));
  }
}

function customerActions(row) {
  return `
    <div class="actions">
      <button class="button" data-view-customer="${row.id}">View</button>
      <button class="button" data-edit-customer="${row.id}">Edit</button>
      <button class="button" data-pay-customer="${row.id}">Payment</button>
      <button class="button" data-statement-customer="${row.id}">Statement</button>
      <button class="button danger" data-archive-customer="${row.id}">Archive</button>
    </div>
  `;
}

function bindCustomerActions(customers) {
  document.querySelectorAll("[data-view-customer]").forEach((button) => button.addEventListener("click", () => openCustomerDetail(button.dataset.viewCustomer)));
  document.querySelectorAll("[data-edit-customer]").forEach((button) => button.addEventListener("click", () => openCustomerForm(customers.find((item) => item.id === button.dataset.editCustomer))));
  document.querySelectorAll("[data-pay-customer]").forEach((button) => button.addEventListener("click", () => openPaymentForm({ customerId: button.dataset.payCustomer })));
  document.querySelectorAll("[data-statement-customer]").forEach((button) => button.addEventListener("click", () => openCustomerStatement(button.dataset.statementCustomer)));
  document.querySelectorAll("[data-archive-customer]").forEach((button) => {
    button.addEventListener("click", () => confirmAction("Archive this customer? Existing financial history will remain protected.", async () => api(`/api/customers/${button.dataset.archiveCustomer}/archive`, { method: "PATCH", body: {} })));
  });
}

function openCustomerForm(customer = {}) {
  openModal(
    customer.id ? "Edit customer" : "Add customer",
    `<div class="form-grid">
      ${formInput("name", "Customer name", customer.name || "", "text", "required")}
      ${formInput("phone", "Phone", customer.phone || "", "text", "required")}
      ${formInput("email", "Email", customer.email || "", "email")}
      ${formInput("customerType", "Customer type", customer.customerType || "regular")}
      ${formInput("openingBalance", "Opening balance", customer.openingBalance || 0, "number", "step='0.01'")}
      ${formInput("address", "Address", customer.address || "")}
      ${formTextarea("notes", "Notes", customer.notes || "")}
    </div>`,
    async (form) => {
      const values = formValues(form);
      if (customer.id) await api(`/api/customers/${customer.id}`, { method: "PATCH", body: values });
      else await api("/api/customers", { method: "POST", body: values });
    }
  );
}

async function openCustomerDetail(customerId) {
  const data = await api(`/api/customers/${customerId}`);
  const c = data.customer;
  openModal(
    c.name,
    `<div class="detail-list">
      <div class="detail-row"><span class="label">Phone</span><span>${escapeHtml(c.phone)}</span></div>
      <div class="detail-row"><span class="label">Address</span><span>${escapeHtml(c.address)}</span></div>
      <div class="detail-row"><span class="label">Balance</span><span class="money">${money(c.balance)}</span></div>
      <div class="detail-row"><span class="label">Orders</span><span>${c.totalOrders}</span></div>
    </div>
    <div class="actions" style="margin:14px 0;">
      <button type="button" class="button" data-detail-order>Create Order</button>
      <button type="button" class="button" data-detail-payment>Record Payment</button>
      <button type="button" class="button" data-detail-note>Add Note</button>
      <button type="button" class="button" data-detail-attachment>Add Attachment</button>
      <button type="button" class="button" data-detail-statement>Print Statement</button>
      <button type="button" class="button" data-detail-statement-pdf>Download PDF</button>
      <button type="button" class="button" data-detail-statement-whatsapp>Share on WhatsApp</button>
    </div>
    <h3>Recent orders</h3>
    ${table(
      [
        { label: "Order", value: "orderNumber" },
        { label: "Date", value: (row) => date(row.orderDate) },
        { label: "Total", value: (row) => money(row.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0) - Number(row.discount || 0) + Number(row.tax || 0)) },
        { label: "Status", value: (row) => badge(row.status) }
      ],
      data.orders.slice(0, 5),
      "No orders for this customer."
    )}
    <h3>Notes</h3>
    ${data.notes.length ? data.notes.map((note) => `<div class="detail-row"><span class="label">${escapeHtml(note.title || "Note")}</span><span>${escapeHtml(note.content)}</span></div>`).join("") : emptyState("No notes yet.")}
    <h3>Attachments</h3>
    ${data.attachments.length ? data.attachments.map((file) => `<div class="detail-row"><span class="label">${escapeHtml(file.label || file.fileName)}</span><span><a href="/api/attachments/${file.id}/download" target="_blank">${escapeHtml(file.fileName)}</a></span></div>`).join("") : emptyState("No attachments yet.")}
    `,
    async () => {},
    "Close"
  );
  modalRoot.querySelector("button[type='submit']").classList.add("hide");
  modalRoot.querySelector("[data-detail-order]").addEventListener("click", () => openOrderForm({ customerId }));
  modalRoot.querySelector("[data-detail-payment]").addEventListener("click", () => openPaymentForm({ customerId }));
  modalRoot.querySelector("[data-detail-note]").addEventListener("click", () => openNoteForm("customer", customerId));
  modalRoot.querySelector("[data-detail-attachment]").addEventListener("click", () => openAttachmentForm("customer", customerId));
  modalRoot.querySelector("[data-detail-statement]").addEventListener("click", () => window.open(`/api/customers/${customerId}/statement/print`, "_blank"));
  modalRoot.querySelector("[data-detail-statement-pdf]").addEventListener("click", () => window.open(`/api/customers/${customerId}/statement/pdf`, "_blank"));
  modalRoot.querySelector("[data-detail-statement-whatsapp]").addEventListener("click", () => shareDocumentOnWhatsApp(
    { entityType: "statement", entityId: customerId },
    (share) => `Hello, please find your ${state.settings.businessName || "DawnGas"} customer statement below.\n\nCustomer: ${c.name}\nBalance Due: ${money(c.balance)}\n\nDownload PDF:\n${share.pdfUrl}`
  ));
}

async function openCustomerStatement(customerId) {
  const data = await api(`/api/customers/${customerId}/statement`);
  const s = data.statement;
  openModal(
    `Statement: ${s.customer.name}`,
    `<div class="detail-row"><span class="label">Balance due</span><span class="money">${money(s.balanceDue)}</span></div>
    <div class="actions" style="margin:14px 0;">
      <button type="button" class="button" data-print-statement>Print</button>
      <button type="button" class="button" data-csv-statement>Export CSV</button>
      <button type="button" class="button" data-pdf-statement>Download PDF</button>
      <button type="button" class="button" data-whatsapp-statement>Share on WhatsApp</button>
    </div>
    ${table(
      [
        { label: "Date", value: "date" },
        { label: "Type", value: "type" },
        { label: "Number", value: "number" },
        { label: "Debit", value: (row) => money(row.debit) },
        { label: "Credit", value: (row) => money(row.credit) }
      ],
      s.transactions,
      "No statement transactions."
    )}`,
    async () => {},
    "Close"
  );
  modalRoot.querySelector("button[type='submit']").classList.add("hide");
  modalRoot.querySelector("[data-print-statement]").addEventListener("click", () => window.open(`/api/customers/${customerId}/statement/print`, "_blank"));
  modalRoot.querySelector("[data-csv-statement]").addEventListener("click", () => window.open(`/api/customers/${customerId}/statement/csv`, "_blank"));
  modalRoot.querySelector("[data-pdf-statement]").addEventListener("click", () => window.open(`/api/customers/${customerId}/statement/pdf`, "_blank"));
  modalRoot.querySelector("[data-whatsapp-statement]").addEventListener("click", () => shareDocumentOnWhatsApp(
    { entityType: "statement", entityId: customerId },
    (share) => `Hello, please find your ${state.settings.businessName || "DawnGas"} customer statement below.\n\nCustomer: ${s.customer.name}\nBalance Due: ${money(s.balanceDue)}\n\nDownload PDF:\n${share.pdfUrl}`
  ));
}

async function renderProducts() {
  setContent(pageShell("Products", "Manage finished products, raw materials, spare parts, accessories, and services.", `<button class="button primary" data-add-product>Add Item</button><button class="button" data-export-products>Export CSV</button>`));
  const data = await api("/api/products");
  setContent(pageShell("Products", "Manage finished products, raw materials, spare parts, accessories, and services.", `<button class="button primary" data-add-product>Add Item</button><button class="button" data-export-products>Export CSV</button>`, table(
    [
      { label: "Item Name", value: (row) => `<div class="item-cell">${row.imageFileId ? `<img class="product-thumb" src="/api/uploads/${escapeHtml(row.imageFileId)}" alt="${escapeHtml(row.name)}">` : ""}<div><strong>${escapeHtml(row.name)}</strong><br><small>${escapeHtml(row.invoiceDisplayName || "")}</small></div></div>` },
      { label: "SKU", value: (row) => escapeHtml(row.sku || "") },
      { label: "Type", value: (row) => escapeHtml(row.displayItemType || displayItemType(row.itemType)) },
      { label: "Category", value: (row) => escapeHtml(row.categoryName || row.category?.name || "") },
      { label: "Unit", value: (row) => escapeHtml(row.unitOfMeasure || "") },
      { label: "Cost", value: (row) => row.itemType === "SERVICE" ? money(row.costPrice) : money(row.costPrice) },
      { label: "Selling / Charge", value: (row) => money(row.itemType === "SERVICE" ? row.standardServiceCharge : row.sellingPrice) },
      { label: "Current Stock", value: (row) => row.trackInventory ? `<span class="number">${row.stock ? row.stock.currentStock : 0}</span>` : "Not Tracked" },
      { label: "Low Stock Threshold", value: (row) => row.trackInventory ? escapeHtml(row.stock?.lowStockThreshold ?? "") : "" },
      { label: "Stock Status", value: (row) => stockBadge(row) },
      { label: "Track Inventory", value: (row) => row.trackInventory ? "Yes" : "No" },
      { label: "Status", value: (row) => badge(row.status) },
      { label: "Actions", value: (row) => productActions(row) }
    ],
    data.products,
    "No products yet. Add finished products, raw materials, spare parts, or services to start managing inventory and invoicing."
  )));
  document.querySelector("[data-add-product]").addEventListener("click", () => openProductForm());
  document.querySelector("[data-export-products]").addEventListener("click", () => window.open("/api/exports/products/csv", "_blank"));
  document.querySelectorAll("[data-view-product]").forEach((button) => button.addEventListener("click", () => openProductDetail(data.products.find((item) => item.id === button.dataset.viewProduct))));
  document.querySelectorAll("[data-edit-product]").forEach((button) => button.addEventListener("click", () => openProductForm(data.products.find((item) => item.id === button.dataset.editProduct))));
  document.querySelectorAll("[data-inventory-product]").forEach((button) => button.addEventListener("click", () => {
    location.hash = "#inventory";
    renderInventory({ search: button.dataset.inventoryProduct });
  }));
  document.querySelectorAll("[data-duplicate-product]").forEach((button) => {
    button.addEventListener("click", () => {
      const original = data.products.find((item) => item.id === button.dataset.duplicateProduct);
      const duplicate = { ...original, id: "", name: `${original.name} Copy`, sku: "", invoiceDisplayName: original.invoiceDisplayName ? `${original.invoiceDisplayName} Copy` : "" };
      openProductForm(duplicate);
    });
  });
  document.querySelectorAll("[data-archive-product]").forEach((button) => button.addEventListener("click", () => confirmAction("Archive this product?", async () => api(`/api/products/${button.dataset.archiveProduct}/archive`, { method: "PATCH", body: {} }))));
}

function productActions(row) {
  return `
    <div class="actions compact-actions">
      <button class="button" data-view-product="${row.id}">View</button>
      <button class="button" data-edit-product="${row.id}">Edit</button>
      ${row.trackInventory ? `<button class="button" data-inventory-product="${escapeHtml(row.sku || row.name)}">Inventory</button>` : ""}
      <button class="button" data-duplicate-product="${row.id}">Duplicate</button>
      <button class="button danger" data-archive-product="${row.id}">Archive</button>
    </div>
  `;
}

function openProductDetail(product) {
  if (!product) return;
  const behavior = product.itemTypeBehavior || itemTypeBehavior(product.itemType);
  openModal(
    product.name,
    `<div class="detail-list">
      <div class="detail-row"><span class="label">SKU</span><span>${escapeHtml(product.sku || "")}</span></div>
      <div class="detail-row"><span class="label">Type</span><span>${escapeHtml(product.displayItemType || displayItemType(product.itemType))}</span></div>
      <div class="detail-row"><span class="label">Category</span><span>${escapeHtml(product.categoryName || "")}</span></div>
      <div class="detail-row"><span class="label">Inventory</span><span>${product.trackInventory ? `${escapeHtml(product.stock?.currentStock ?? 0)} ${escapeHtml(product.unitOfMeasure || "")}` : "Not Tracked"}</span></div>
      <div class="detail-row"><span class="label">Invoices</span><span>${behavior.appearsInInvoices ? "Appears in invoices" : "Hidden from invoices"}</span></div>
      <div class="detail-row"><span class="label">Purchases</span><span>${behavior.appearsInPurchases ? "Appears in purchases" : "Hidden from purchases"}</span></div>
      <div class="detail-row"><span class="label">Production</span><span>${behavior.canHaveBillOfMaterials ? "Can have bill of materials" : "No BOM"}</span></div>
      <div class="detail-row"><span class="label">Notes</span><span>${escapeHtml(product.notes || "")}</span></div>
    </div>`,
    async () => {},
    "Close"
  );
  modalRoot.querySelector("button[type='submit']").classList.add("hide");
}

async function categoryOptions(type = "FINISHED_PRODUCT") {
  const data = await api(`/api/categories?type=${encodeURIComponent(type)}`);
  return data.categories.map((category) => ({ value: category.id, label: category.name, category }));
}

async function openProductForm(product = {}) {
  const [categories, bomComponents, typeOptions, units, locations] = await Promise.all([
    api("/api/categories"),
    productOptions({ bomOnly: true }),
    masterOptions("itemTypes", []),
    masterOptions("unitsOfMeasure", []),
    masterOptions("storageLocations", [])
  ]);
  const activeCategories = (categories.categories || []).filter((category) => String(category.status || "ACTIVE").toUpperCase() !== "ARCHIVED");
  const typeChoices = typeOptions.length ? typeOptions : itemTypeOptions;
  const type = product.itemType || "FINISHED_PRODUCT";
  const behavior = itemTypeBehavior(type);
  const defaultUnit = product.unitOfMeasure || behavior.defaultUnitOfMeasure || units.find((item) => item.record?.isDefault)?.value || units[0]?.value || "piece";
  const defaultLocation = product.stock?.storageLocation || locations.find((item) => item.record?.id === product.stock?.storageLocationId)?.value || locations.find((item) => item.record?.isDefault)?.value || locations[0]?.value || "";
  const unitOptionsForForm = units.length ? units : [{ value: defaultUnit, label: "No units added yet" }];
  const locationOptionsForForm = locations.length ? locations : [{ value: "", label: "No storage locations added yet" }];
  openModal(
    product.id ? "Edit item" : "Add item",
    `
      ${formSection("Item Classification", `
        <div class="field"><label for="itemType">Item Type</label><select id="itemType" name="itemType" data-item-type>${typeChoices.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === type ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select><small>Item type controls inventory, invoice, purchase, production, and report behavior.</small></div>
        <div class="field"><label for="categoryId">Category</label><div class="inline-field"><select id="categoryId" name="categoryId" data-category-select>${activeCategories.map((category) => `<option value="${category.id}" data-type="${escapeHtml(category.type)}" ${category.id === product.categoryId ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}</select><button class="button" type="button" data-add-category-inline>+ Add</button></div></div>
        ${formSelect("status", "Status", [{ value: "ACTIVE", label: "Active" }, { value: "ARCHIVED", label: "Archived" }], product.status || "ACTIVE")}
        <div class="field wide hide" data-classification-warning></div>
      `, "Choose the item type first. The form will show the correct fields for inventory, invoices, purchases, and production.")}
      ${formSection("Basic Details", `
        ${formInput("name", "Item Name", product.name || "", "text", "required")}
        ${formInput("invoiceDisplayName", "Invoice Display Name", product.invoiceDisplayName || "")}
        <div class="field"><label for="sku">SKU / Item Code</label><div class="inline-field"><input id="sku" name="sku" type="text" value="${escapeHtml(product.sku || "")}"><button class="button" type="button" data-generate-sku>Auto</button></div><small>Examples: HOB-001, STV-001, RAW-001, SPR-001, SRV-001.</small></div>
        ${formTextarea("description", "Description", product.description || "")}
        <div class="field wide">
          <label for="productImage">Product image / attachment</label>
          <input id="productImage" name="productImage" type="file" accept=".jpg,.jpeg,.png,.webp">
          <small>${product.imageFileId ? `<a href="/api/uploads/${escapeHtml(product.imageFileId)}" target="_blank">Current image</a>` : "Optional image for product records."}</small>
        </div>
      `)}
      ${formSection("Pricing", `
        <div data-cost-field>${formInput("costPrice", "Cost Price", product.costPrice || 0, "number", "step='0.01' min='0'")}</div>
        <div data-sale-field>${formInput("sellingPrice", "Selling Price", product.sellingPrice || 0, "number", "step='0.01' min='0'")}</div>
        <div data-service-field>${formInput("standardServiceCharge", "Standard Service Charge", product.standardServiceCharge || product.unitPrice || 0, "number", "step='0.01' min='0'")}</div>
        <div data-service-field>${formInput("costPriceService", "Cost Estimate", product.costPrice || 0, "number", "step='0.01' min='0'")}</div>
        <div data-direct-sale-field>${formToggle("allowDirectSale", "Allow Direct Sale", product.allowDirectSale || false, "Enable this only when a raw material should be available on invoices.")}</div>
        ${formToggle("taxable", "Taxable", product.taxable || false, "Mark if tax should be considered for this item.")}
        ${formInput("warrantyPeriod", "Warranty Period", product.warrantyPeriod || "")}
      `)}
      <section class="form-section" data-inventory-section>
        <div class="form-section-head"><h4>Inventory Setup</h4><p>Use these fields only for stock-tracked items.</p></div>
        <div class="form-grid">
          ${formToggle("trackInventory", "Track Inventory", product.trackInventory !== false, "Turn this on if you want the system to monitor stock quantity for this item.")}
          <div class="field"><label for="unitOfMeasure">Unit of Measure</label><div class="inline-field"><select id="unitOfMeasure" name="unitOfMeasure">${unitOptionsForForm.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === defaultUnit ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select><button class="button" type="button" data-add-unit-inline>+ Add</button></div></div>
          ${product.id ? "" : formInput("openingStockQuantity", "Opening Stock Quantity", 0, "number", "min='0' step='0.01'")}
          ${formInput("lowStockThreshold", "Low Stock Threshold", product.stock?.lowStockThreshold ?? state.settings?.lowStockThreshold ?? 5, "number", "min='0' step='0.01'")}
          ${formInput("reorderQuantity", "Reorder Quantity", product.stock?.reorderQuantity || 0, "number", "min='0' step='0.01'")}
          <div class="field"><label for="storageLocation">Storage Location</label><div class="inline-field"><select id="storageLocation" name="storageLocation">${locationOptionsForForm.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === defaultLocation ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select><button class="button" type="button" data-add-location-inline>+ Add</button></div></div>
        </div>
      </section>
      <section class="form-section" data-production-section>
        <div class="form-section-head"><h4>Production / Materials Required</h4><p>Define which raw materials or spare parts are required to produce this item.</p></div>
        <div class="form-grid">
          ${formToggle("canBeProduced", "Can be Produced / Assembled", product.canBeProduced || false, "Turn this on if this item is made from components.")}
          ${formToggle("hasBillOfMaterials", "Materials Required Enabled", product.hasBillOfMaterials || false, "Turn this on to define component rows.")}
        </div>
        <div class="bom-editor" data-bom-editor>
          ${renderBomEditor(product.bom || [], bomComponents, units)}
        </div>
      </section>
      ${formSection("Notes and Attachments", `${formTextarea("notes", "Notes", product.notes || "")}`)}
    `,
    async (form) => {
      const values = formValues(form);
      const imageFile = form.querySelector("#productImage")?.files?.[0];
      delete values.productImage;
      if (imageFile) {
        const uploaded = await uploadFormFile(imageFile, "product", product.id || "");
        values.imageFileId = uploaded.file.id;
      } else if (product.imageFileId) {
        values.imageFileId = product.imageFileId;
      }
      if (values.costPriceService && values.itemType === "SERVICE") values.costPrice = values.costPriceService;
      values.bom = collectBomRows(form);
      if (product.id) await api(`/api/products/${product.id}`, { method: "PATCH", body: values });
      else await api("/api/products", { method: "POST", body: values });
    }
  );
  bindProductTypeForm(activeCategories, units, locations, bomComponents);
}

async function renderInventory(filters = {}) {
  setContent(pageShell("Inventory", "Track stock levels, thresholds, locations, and movement history.", `<button class="button primary" data-adjust-stock>Adjust Stock</button><button class="button" data-add-product>Add Product</button><button class="button" data-export-inventory>Export CSV</button>`));
  const [data, categories, typeOptions, locations] = await Promise.all([
    api(`/api/inventory${queryParams(filters)}`),
    api("/api/categories"),
    masterOptions("itemTypes", itemTypeOptions),
    masterOptions("storageLocations", [])
  ]);
  const locationOptions = [{ value: "", label: "All locations" }, ...locations.filter((option) => option.value)];
  const body = `
    <form class="panel filters" data-inventory-filters>
      ${formInput("search", "Search", filters.search || "", "search", "placeholder='Name, SKU, or location'")}
      ${formSelect("itemType", "Item Type", [{ value: "", label: "All item types" }, ...typeOptions], filters.itemType || "")}
      ${formSelect("categoryId", "Category", [{ value: "", label: "All categories" }, ...categories.categories.map((category) => ({ value: category.id, label: category.name }))], filters.categoryId || "")}
      ${formSelect("status", "Stock Status", [{ value: "", label: "All statuses" }, { value: "IN_STOCK", label: "In Stock" }, { value: "LOW_STOCK", label: "Low Stock" }, { value: "OUT_OF_STOCK", label: "Out of Stock" }], filters.status || "")}
      ${formSelect("storageLocation", "Storage Location", locationOptions, filters.storageLocation || "")}
      <div class="actions"><button class="button primary" type="submit">Apply</button><button class="button" type="button" data-clear-inventory-filters>Clear</button></div>
    </form>
    ${table(
      [
        { label: "Item Name", value: (row) => `<strong>${escapeHtml(row.product?.name || "Unknown")}</strong><br><small>${escapeHtml(row.product?.sku || "")}</small>` },
        { label: "Type", value: (row) => escapeHtml(displayItemType(row.itemType)) },
        { label: "Category", value: (row) => escapeHtml(row.categoryName || "") },
        { label: "Unit", value: (row) => escapeHtml(row.product?.unitOfMeasure || "") },
        { label: "Current", value: (row) => `<span class="number">${row.currentStock}</span>` },
        { label: "Reserved", value: (row) => row.reservedStock },
        { label: "Available", value: (row) => `<span class="number">${row.availableStock}</span>` },
        { label: "Threshold", value: "lowStockThreshold" },
        { label: "Reorder", value: "reorderQuantity" },
        { label: "Location", value: (row) => escapeHtml(row.storageLocationName || row.storageLocationSnapshotName || row.storageLocation || "") },
        { label: "Last Movement", value: (row) => date(row.lastMovementAt || row.updatedAt) },
        { label: "Status", value: (row) => badge(row.status) },
        { label: "Actions", value: (row) => `<button class="button" data-adjust-item="${row.productId}">Adjust</button> <button class="button" data-history-inventory="${row.id}">History</button> <button class="button" data-edit-inventory="${row.id}">Edit</button>` }
      ],
      data.inventory,
      "Inventory records will appear after you add stock-tracked products or raw materials."
    )}
  `;
  setContent(pageShell("Inventory", "Track stock levels, thresholds, locations, and movement history.", `<button class="button primary" data-adjust-stock>Adjust Stock</button><button class="button" data-add-product>Add Product</button><button class="button" data-export-inventory>Export CSV</button>`, body));
  document.querySelector("[data-inventory-filters]").addEventListener("submit", (event) => {
    event.preventDefault();
    renderInventory(formValues(event.currentTarget));
  });
  document.querySelector("[data-clear-inventory-filters]").addEventListener("click", () => renderInventory({}));
  document.querySelector("[data-adjust-stock]").addEventListener("click", () => openStockAdjustment());
  document.querySelector("[data-add-product]").addEventListener("click", () => openProductForm());
  document.querySelector("[data-export-inventory]").addEventListener("click", () => window.open("/api/exports/inventory/csv", "_blank"));
  document.querySelectorAll("[data-edit-inventory]").forEach((button) => button.addEventListener("click", () => openInventoryEdit(data.inventory.find((item) => item.id === button.dataset.editInventory))));
  document.querySelectorAll("[data-adjust-item]").forEach((button) => button.addEventListener("click", () => openStockAdjustment({ productId: button.dataset.adjustItem })));
  document.querySelectorAll("[data-history-inventory]").forEach((button) => button.addEventListener("click", () => openInventoryHistory(button.dataset.historyInventory)));
}

async function productOptions(filters = {}) {
  let path = "/api/products";
  if (filters.sellableOnly) path = "/api/products/invoice-select";
  else if (filters.purchaseOnly) path = "/api/products/purchase-select";
  else if (filters.bomOnly) path = "/api/products/production-components";
  else if (filters.finishedOnly) path = "/api/products/production-finished";
  const data = await api(path);
  let products = data.products;
  if (filters.trackableOnly) products = products.filter((product) => product.trackInventory !== false && product.itemType !== "SERVICE");
  if (filters.rawOnly) products = products.filter((product) => product.itemType === "RAW_MATERIAL");
  return products.map((product) => ({ value: product.id, label: `${product.sku ? `${product.sku} - ` : ""}${product.name}`, product }));
}

function currentInvoicePrice(product) {
  if (!product) return 0;
  return Number(product.itemType === "SERVICE" ? product.standardServiceCharge || product.unitPrice || product.sellingPrice : product.sellingPrice || product.unitPrice || 0);
}

function findProductOption(options, lookup) {
  const needle = String(lookup || "").trim().toLowerCase();
  if (!needle) return null;
  return options.find((option) =>
    [option.value, option.label, option.product?.sku, option.product?.name, option.product?.invoiceDisplayName]
      .some((value) => String(value || "").trim().toLowerCase() === needle)
  );
}

function parseProductLines(text, options, mode) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [lookup, quantity, amount] = line.split("|").map((part) => part.trim());
      const found = findProductOption(options, lookup);
      if (!found) throw new Error(`Could not match item "${lookup}". Use the SKU, exact item name, or item id.`);
      const qty = Number(quantity || 1);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Quantity must be greater than zero for "${lookup}".`);
      if (mode === "purchase") {
        const unitCost = amount === "" || amount === undefined ? Number(found.product?.costPrice || 0) : Number(amount);
        if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error(`Unit cost must be zero or more for "${lookup}".`);
        return { productId: found.value, quantity: qty, unitCost };
      }
      const unitPrice = amount === "" || amount === undefined ? currentInvoicePrice(found.product) : Number(amount);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`Unit price must be zero or more for "${lookup}".`);
      return { productId: found.value, itemName: found.product?.invoiceDisplayName || found.product?.name, quantity: qty, unitPrice };
    });
}

async function customerOptions() {
  const data = await api("/api/customers");
  return data.customers.map((customer) => ({ value: customer.id, label: `${customer.name} - ${customer.phone}`, customer }));
}

async function openInventoryEdit(item) {
  const locations = await masterOptions("storageLocations", []);
  const locationOptions = locations.length ? locations : [{ value: "", label: "No storage locations added yet" }];
  const selectedLocation = item.storageLocation || locations.find((option) => option.record?.id === item.storageLocationId)?.value || "";
  openModal(
    "Edit inventory",
    `<div class="form-grid">
      ${formInput("lowStockThreshold", "Low stock threshold", item.lowStockThreshold || 0, "number")}
      ${formInput("reorderQuantity", "Reorder quantity", item.reorderQuantity || 0, "number")}
      ${formSelect("storageLocation", "Storage location", locationOptions, selectedLocation)}
      ${formTextarea("notes", "Notes", item.notes || "")}
    </div>`,
    async (form) => api(`/api/inventory/${item.id}`, { method: "PATCH", body: formValues(form) })
  );
}

async function openStockAdjustment(defaults = {}) {
  const products = await productOptions({ trackableOnly: true });
  openModal(
    "Adjust stock",
    `<div class="form-grid">
      ${formSelect("productId", "Product / Item", products, defaults.productId || "")}
      ${formSelect("movementType", "Movement Type", [{ value: "ADD_STOCK", label: "Add Stock" }, { value: "REMOVE_STOCK", label: "Remove Stock" }, { value: "MARK_DAMAGED", label: "Mark Damaged" }, { value: "RETURN_STOCK", label: "Return Stock" }, { value: "MANUAL_CORRECTION", label: "Manual Correction" }], "ADD_STOCK")}
      ${formInput("quantity", "Quantity", 1, "number", "min='0' step='0.01' required")}
      ${formTextarea("reason", "Reason", "", "required")}
      ${formTextarea("notes", "Notes", "")}
    </div>`,
    async (form) => api("/api/inventory/adjustments", { method: "POST", body: formValues(form) })
  );
}

function renderBomEditor(rows, components, units) {
  if (!components.length) {
    return `
      <div class="empty compact">No raw materials or spare parts are available yet. Add raw materials first before creating materials required for production.</div>
      <button class="button" type="button" data-add-raw-material>Add Raw Material</button>
    `;
  }
  const seedRows = rows.length ? rows : [];
  return `
    <div class="bom-table-wrap">
      <table class="bom-table">
        <thead><tr><th>Component Item</th><th>Component Type</th><th>Available Stock</th><th>Quantity Required</th><th>Unit</th><th>Wastage %</th><th>Estimated Cost</th><th>Action</th></tr></thead>
        <tbody data-bom-rows>
          ${seedRows.map((row) => bomRowHtml(row, components, units)).join("")}
        </tbody>
      </table>
    </div>
    <button class="button" type="button" data-add-bom-row>Add Component Row</button>
  `;
}

function bomRowHtml(row = {}, components = [], units = []) {
  const selected = row.rawMaterialId || row.productId || components[0]?.value || "";
  const product = components.find((item) => item.value === selected)?.product || row.material || {};
  const unit = row.unitOfMeasure || product.unitOfMeasure || units[0]?.value || "piece";
  const quantity = Number(row.quantityRequired || row.quantity || 1);
  const estimated = Number(product.costPrice || 0) * quantity;
  return `
    <tr data-bom-row>
      <td><select data-bom-product>${components.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></td>
      <td data-bom-type>${escapeHtml(product.displayItemType || displayItemType(product.itemType))}</td>
      <td data-bom-stock>${product.trackInventory ? escapeHtml(product.stock?.availableStock ?? 0) : "Not Tracked"}</td>
      <td><input data-bom-quantity type="number" min="0.01" step="0.01" value="${escapeHtml(quantity)}"></td>
      <td><select data-bom-unit>${units.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === unit ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></td>
      <td><input data-bom-wastage type="number" min="0" step="0.01" value="${escapeHtml(row.wastagePercentage || 0)}"></td>
      <td data-bom-cost>${money(estimated)}</td>
      <td><button class="button danger" type="button" data-remove-bom-row>Remove</button></td>
    </tr>
  `;
}

function collectBomRows(form) {
  return Array.from(form.querySelectorAll("[data-bom-row]"))
    .map((row) => ({
      rawMaterialId: row.querySelector("[data-bom-product]")?.value || "",
      quantityRequired: Number(row.querySelector("[data-bom-quantity]")?.value || 0),
      unitOfMeasure: row.querySelector("[data-bom-unit]")?.value || "",
      wastagePercentage: Number(row.querySelector("[data-bom-wastage]")?.value || 0)
    }))
    .filter((row) => row.rawMaterialId && row.quantityRequired > 0);
}

function bindBomEditor(components, units) {
  const editor = modalRoot.querySelector("[data-bom-editor]");
  if (!editor) return;
  const refreshRow = (row) => {
    const product = components.find((item) => item.value === row.querySelector("[data-bom-product]")?.value)?.product || {};
    const quantity = Number(row.querySelector("[data-bom-quantity]")?.value || 0);
    row.querySelector("[data-bom-type]").textContent = product.displayItemType || displayItemType(product.itemType);
    row.querySelector("[data-bom-stock]").textContent = product.trackInventory ? product.stock?.availableStock ?? 0 : "Not Tracked";
    const unitSelect = row.querySelector("[data-bom-unit]");
    if (product.unitOfMeasure && !unitSelect.value) unitSelect.value = product.unitOfMeasure;
    row.querySelector("[data-bom-cost]").textContent = money(Number(product.costPrice || 0) * quantity);
  };
  editor.addEventListener("change", (event) => {
    const row = event.target.closest("[data-bom-row]");
    if (row) refreshRow(row);
  });
  editor.addEventListener("input", (event) => {
    const row = event.target.closest("[data-bom-row]");
    if (row) refreshRow(row);
  });
  editor.addEventListener("click", (event) => {
    if (event.target.matches("[data-add-bom-row]")) {
      editor.querySelector("[data-bom-rows]").insertAdjacentHTML("beforeend", bomRowHtml({}, components, units));
      refreshRow(editor.querySelector("[data-bom-rows] tr:last-child"));
    }
    if (event.target.matches("[data-remove-bom-row]")) event.target.closest("[data-bom-row]").remove();
    if (event.target.matches("[data-add-raw-material]")) openProductForm({ itemType: "RAW_MATERIAL" });
  });
}

function bindProductTypeForm(categories, units, locations, bomComponents) {
  const typeSelect = modalRoot.querySelector("[data-item-type]");
  const categorySelect = modalRoot.querySelector("[data-category-select]");
  const skuInput = modalRoot.querySelector("#sku");
  const nameInput = modalRoot.querySelector("#name");
  const warning = modalRoot.querySelector("[data-classification-warning]");
  const unitSelect = modalRoot.querySelector("#unitOfMeasure");
  let lastType = typeSelect.value;
  unitSelect?.addEventListener("change", () => {
    unitSelect.dataset.userChanged = "true";
  });
  const update = () => {
    const type = typeSelect.value;
    const typeChanged = type !== lastType;
    const behavior = itemTypeBehavior(type);
    Array.from(categorySelect.options).forEach((option) => {
      option.hidden = option.dataset.type !== type;
    });
    if (categorySelect.selectedOptions[0]?.hidden) {
      const first = Array.from(categorySelect.options).find((option) => !option.hidden);
      if (first) categorySelect.value = first.value;
    }
    if (unitSelect && behavior.defaultUnitOfMeasure && (!unitSelect.value || (typeChanged && unitSelect.dataset.userChanged !== "true"))) {
      unitSelect.value = behavior.defaultUnitOfMeasure;
    }
    modalRoot.querySelector("[data-inventory-section]")?.classList.toggle("hide", !behavior.canTrackInventory);
    modalRoot.querySelector("[data-production-section]")?.classList.toggle("hide", !behavior.canHaveBillOfMaterials);
    modalRoot.querySelectorAll("[data-service-field]").forEach((el) => el.classList.toggle("hide", type !== "SERVICE"));
    modalRoot.querySelector("[data-cost-field]")?.classList.toggle("hide", !behavior.requiresCostPrice && type === "SERVICE");
    modalRoot.querySelector("[data-sale-field]")?.classList.toggle("hide", type === "SERVICE" || (type === "RAW_MATERIAL" && !modalRoot.querySelector("#allowDirectSale")?.checked));
    modalRoot.querySelector("[data-direct-sale-field]")?.classList.toggle("hide", type !== "RAW_MATERIAL");
    const canProduced = modalRoot.querySelector("#canBeProduced")?.checked;
    const hasBom = modalRoot.querySelector("#hasBillOfMaterials")?.checked;
    modalRoot.querySelector("[data-bom-editor]")?.classList.toggle("hide", !(behavior.canHaveBillOfMaterials && canProduced && hasBom));
    if (!behavior.canTrackInventory && modalRoot.querySelector("#trackInventory")) modalRoot.querySelector("#trackInventory").checked = false;
    const name = String(nameInput?.value || "").toLowerCase();
    const soundsRaw = ["steel", "sheet", "pipe", "valve", "screw", "glass", "packaging", "burner"].some((word) => name.includes(word));
    warning.classList.toggle("hide", !(soundsRaw && type === "FINISHED_PRODUCT"));
    warning.textContent = soundsRaw && type === "FINISHED_PRODUCT" ? "This item name sounds like a raw material. You selected Finished Product. You can continue if this is intentional." : "";
    lastType = type;
  };
  typeSelect.addEventListener("change", update);
  nameInput?.addEventListener("input", update);
  modalRoot.querySelector("#allowDirectSale")?.addEventListener("change", update);
  modalRoot.querySelector("#canBeProduced")?.addEventListener("change", update);
  modalRoot.querySelector("#hasBillOfMaterials")?.addEventListener("change", update);
  modalRoot.querySelector("[data-generate-sku]").addEventListener("click", async () => {
    const result = await api(`/api/products/sku/suggest?itemType=${encodeURIComponent(typeSelect.value)}&categoryId=${encodeURIComponent(categorySelect.value)}`);
    skuInput.value = result.sku;
  });
  modalRoot.querySelector("[data-add-category-inline]").addEventListener("click", async () => {
    const name = window.prompt("Category name");
    if (!name) return;
    const result = await api("/api/categories", { method: "POST", body: { name, type: typeSelect.value } });
    const option = document.createElement("option");
    option.value = result.category.id;
    option.textContent = result.category.name;
    option.dataset.type = result.category.type;
    categorySelect.appendChild(option);
    categorySelect.value = result.category.id;
    toast("Category added.");
  });
  modalRoot.querySelector("[data-add-unit-inline]").addEventListener("click", async () => {
    const label = window.prompt("Unit name");
    if (!label) return;
    const result = await api("/api/master-data/units", { method: "POST", body: { label, value: label } });
    const option = document.createElement("option");
    option.value = result.item.value;
    option.textContent = result.item.label;
    modalRoot.querySelector("#unitOfMeasure").appendChild(option);
    modalRoot.querySelector("#unitOfMeasure").value = result.item.value;
    state.masterData = null;
    toast("Unit added.");
  });
  modalRoot.querySelector("[data-add-location-inline]").addEventListener("click", async () => {
    const label = window.prompt("Storage location name");
    if (!label) return;
    const result = await api("/api/master-data/storage-locations", { method: "POST", body: { label, value: label } });
    const option = document.createElement("option");
    option.value = result.item.value;
    option.textContent = result.item.label;
    modalRoot.querySelector("#storageLocation").appendChild(option);
    modalRoot.querySelector("#storageLocation").value = result.item.value;
    state.masterData = null;
    toast("Storage location added.");
  });
  bindBomEditor(bomComponents, units);
  update();
}

async function openInventoryHistory(inventoryId) {
  const data = await api(`/api/inventory/${inventoryId}/history`);
  openModal(
    "Inventory movement history",
    table(
      [
        { label: "Date", value: (row) => date(row.createdAt) },
        { label: "Type", value: "movementType" },
        { label: "Quantity", value: "quantity" },
        { label: "Previous", value: "previousStock" },
        { label: "New", value: "newStock" },
        { label: "Reason", value: "reason" }
      ],
      data.history,
      "No movement history yet."
    ),
    async () => {},
    "Close"
  );
  modalRoot.querySelector("button[type='submit']").classList.add("hide");
}

async function renderProduction() {
  setContent(pageShell("Production / Assembly", "Convert raw materials and spare parts into finished products.", `<button class="button primary" data-add-production>Create Production Batch</button>`));
  const data = await api("/api/production");
  setContent(pageShell("Production / Assembly", "Convert raw materials and spare parts into finished products.", `<button class="button primary" data-add-production>Create Production Batch</button>`, table(
    [
      { label: "Batch", value: (row) => `<strong>${escapeHtml(row.batchNumber)}</strong><br><small>${date(row.productionDate)}</small>` },
      { label: "Finished Product", value: (row) => escapeHtml(row.finishedProduct?.name || "") },
      { label: "Quantity", value: "quantityProduced" },
      { label: "Estimated Cost", value: (row) => money(row.estimatedCost) },
      { label: "Status", value: (row) => badge(row.status) },
      { label: "Actions", value: (row) => `<button class="button" data-view-production="${row.id}">Details</button>${row.status === "DRAFT" ? ` <button class="button" data-complete-production="${row.id}">Complete</button>` : ""}` }
    ],
    data.production,
    "No production batches yet. Create your first production batch to convert raw materials into finished products."
  )));
  document.querySelector("[data-add-production]").addEventListener("click", () => openProductionForm());
  document.querySelectorAll("[data-view-production]").forEach((button) => button.addEventListener("click", () => openProductionDetail(button.dataset.viewProduction)));
  document.querySelectorAll("[data-complete-production]").forEach((button) => button.addEventListener("click", () => confirmAction("Complete this production batch and move stock?", async () => api(`/api/production/${button.dataset.completeProduction}/complete`, { method: "PATCH", body: {} }))));
}

async function openProductionForm() {
  const products = await productOptions({ finishedOnly: true });
  openModal(
    "Create production batch",
    `<div class="form-grid">
      ${formSelect("finishedProductId", "Finished Product", products, "")}
      ${formInput("quantityProduced", "Quantity to Produce", 1, "number", "min='1' step='0.01' required")}
      ${formInput("productionDate", "Production Date", today(), "date")}
      ${formSelect("status", "Create Mode", [{ value: "COMPLETED", label: "Create and complete now" }, { value: "DRAFT", label: "Save as draft" }], "COMPLETED")}
      ${formTextarea("notes", "Notes", "")}
    </div>`,
    async (form) => api("/api/production", { method: "POST", body: formValues(form) })
  );
}

async function openProductionDetail(id) {
  const data = await api(`/api/production/${id}`);
  const batch = data.production;
  openModal(
    `Production ${batch.batchNumber}`,
    `<div class="detail-list">
      <div class="detail-row"><span class="label">Finished Product</span><span>${escapeHtml(batch.finishedProduct?.name || "")}</span></div>
      <div class="detail-row"><span class="label">Quantity</span><span>${escapeHtml(batch.quantityProduced)}</span></div>
      <div class="detail-row"><span class="label">Estimated Cost</span><span>${money(batch.estimatedCost)}</span></div>
      <div class="detail-row"><span class="label">Status</span><span>${badge(batch.status)}</span></div>
    </div>
    <h3>Raw Materials Used</h3>
    ${table([{ label: "Material", value: (row) => escapeHtml(row.material?.name || "") }, { label: "Quantity Used", value: "quantityUsed" }, { label: "Unit", value: "unitOfMeasure" }, { label: "Cost", value: (row) => money(row.totalCost) }], batch.materials || [], "No material usage recorded yet.")}`,
    async () => {},
    "Close"
  );
  modalRoot.querySelector("button[type='submit']").classList.add("hide");
}

async function renderSuppliers() {
  setContent(pageShell("Suppliers", "Track suppliers for raw materials, spare parts, and purchased stock.", `<button class="button primary" data-add-supplier>Add Supplier</button><button class="button" data-export-suppliers>Export CSV</button>`));
  const data = await api("/api/suppliers");
  setContent(pageShell("Suppliers", "Track suppliers for raw materials, spare parts, and purchased stock.", `<button class="button primary" data-add-supplier>Add Supplier</button><button class="button" data-export-suppliers>Export CSV</button>`, table(
    [
      { label: "Supplier", value: (row) => `<strong>${escapeHtml(row.name)}</strong><br><small>${escapeHtml(row.phone || "")}</small>` },
      { label: "Contact Person", value: (row) => escapeHtml(row.contactPerson || "") },
      { label: "Purchases", value: "totalPurchases" },
      { label: "Outstanding", value: (row) => money(row.outstandingBalance) },
      { label: "Status", value: (row) => badge(row.status) },
      { label: "Actions", value: (row) => `<button class="button" data-edit-supplier="${row.id}">Edit</button> <button class="button danger" data-archive-supplier="${row.id}">Archive</button>` }
    ],
    data.suppliers,
    "No suppliers yet. Add suppliers to track purchases and raw material sources."
  )));
  document.querySelector("[data-add-supplier]").addEventListener("click", () => openSupplierForm());
  document.querySelector("[data-export-suppliers]").addEventListener("click", () => window.open("/api/exports/suppliers/csv", "_blank"));
  document.querySelectorAll("[data-edit-supplier]").forEach((button) => button.addEventListener("click", () => openSupplierForm(data.suppliers.find((item) => item.id === button.dataset.editSupplier))));
  document.querySelectorAll("[data-archive-supplier]").forEach((button) => button.addEventListener("click", () => confirmAction("Archive this supplier?", async () => api(`/api/suppliers/${button.dataset.archiveSupplier}/archive`, { method: "PATCH", body: {} }))));
}

function openSupplierForm(supplier = {}) {
  openModal(
    supplier.id ? "Edit supplier" : "Add supplier",
    `<div class="form-grid">
      ${formInput("name", "Supplier Name", supplier.name || "", "text", "required")}
      ${formInput("phone", "Phone", supplier.phone || "")}
      ${formInput("email", "Email", supplier.email || "", "email")}
      ${formInput("contactPerson", "Contact Person", supplier.contactPerson || "")}
      ${formInput("address", "Address", supplier.address || "")}
      ${formTextarea("notes", "Notes", supplier.notes || "")}
    </div>`,
    async (form) => {
      if (supplier.id) await api(`/api/suppliers/${supplier.id}`, { method: "PATCH", body: formValues(form) });
      else await api("/api/suppliers", { method: "POST", body: formValues(form) });
    }
  );
}

async function renderPurchases() {
  setContent(pageShell("Purchases", "Receive stock from suppliers and update inventory.", `<button class="button primary" data-add-purchase>Create Purchase</button><button class="button" data-export-purchases>Export CSV</button>`));
  const data = await api("/api/purchases");
  setContent(pageShell("Purchases", "Receive stock from suppliers and update inventory.", `<button class="button primary" data-add-purchase>Create Purchase</button><button class="button" data-export-purchases>Export CSV</button>`, table(
    [
      { label: "Purchase", value: (row) => `<strong>${escapeHtml(row.purchaseNumber)}</strong><br><small>${date(row.purchaseDate)}</small>` },
      { label: "Supplier", value: (row) => escapeHtml(row.supplier?.name || "") },
      { label: "Items", value: (row) => (row.items || []).map((item) => `${escapeHtml(item.itemName || item.product?.name || "")} x ${item.quantity}`).join("<br>") },
      { label: "Total", value: (row) => money(row.totalAmount) },
      { label: "Balance", value: (row) => money(row.balanceAmount) },
      { label: "Status", value: (row) => badge(row.status) },
      { label: "Actions", value: (row) => row.status !== "RECEIVED" ? `<button class="button" data-receive-purchase="${row.id}">Receive</button>` : "" }
    ],
    data.purchases,
    "No purchases yet. Create your first purchase to add raw materials or stock."
  )));
  document.querySelector("[data-add-purchase]").addEventListener("click", () => openPurchaseForm());
  document.querySelector("[data-export-purchases]").addEventListener("click", () => window.open("/api/exports/purchases/csv", "_blank"));
  document.querySelectorAll("[data-receive-purchase]").forEach((button) => button.addEventListener("click", () => confirmAction("Receive this purchase and increase stock?", async () => api(`/api/purchases/${button.dataset.receivePurchase}/receive`, { method: "PATCH", body: {} }))));
}

async function openPurchaseForm() {
  const [suppliers, products, statuses] = await Promise.all([
    api("/api/suppliers"),
    productOptions({ purchaseOnly: true }),
    masterOptions("purchaseStatuses", [{ value: "RECEIVED", label: "Received" }, { value: "DRAFT", label: "Draft" }, { value: "CANCELLED", label: "Cancelled" }])
  ]);
  const supplierOptions = [{ value: "", label: "No supplier" }, ...suppliers.suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))];
  openModal(
    "Create purchase",
    `<div class="form-grid">
      ${formSelect("supplierId", "Supplier", supplierOptions, "")}
      ${formInput("purchaseDate", "Purchase Date", today(), "date")}
      ${formSelect("productId", "Item", products, "")}
      ${formInput("quantity", "Quantity", 1, "number", "min='1' step='0.01' required")}
      ${formInput("unitCost", "Unit Cost", 0, "number", "step='0.01' min='0' required")}
      ${formInput("discount", "Discount", 0, "number", "step='0.01'")}
      ${formInput("tax", "Tax", 0, "number", "step='0.01'")}
      ${formInput("paidAmount", "Paid Amount", 0, "number", "step='0.01'")}
      ${formSelect("status", "Status", statuses.filter((item) => item.value !== "CANCELLED"), "RECEIVED")}
      ${formTextarea("itemsText", "Additional Items", "", "placeholder='SKU or exact name | quantity | unit cost'")}
      ${formTextarea("notes", "Notes", "")}
    </div>`,
    async (form) => {
      const values = formValues(form);
      const items = [{ productId: values.productId, quantity: values.quantity, unitCost: values.unitCost }, ...parseProductLines(values.itemsText, products, "purchase")];
      await api("/api/purchases", { method: "POST", body: { ...values, items } });
    }
  );
}

async function renderInvoices() {
  setContent(pageShell("Invoices", "Create invoices, issue stock, print documents, and record payments.", `<button class="button primary" data-add-invoice>Create Invoice</button><button class="button" data-export-invoices>Export CSV</button>`));
  const data = await api("/api/invoices");
  setContent(pageShell("Invoices", "Create invoices, issue stock, print documents, and record payments.", `<button class="button primary" data-add-invoice>Create Invoice</button><button class="button" data-export-invoices>Export CSV</button>`, table(
    [
      { label: "Invoice", value: (row) => `<strong>${escapeHtml(row.invoiceNumber)}</strong><br><small>${date(row.invoiceDate)}</small>` },
      { label: "Customer", value: (row) => escapeHtml(row.customer?.name || "") },
      { label: "Total", value: (row) => money(row.totalAmount) },
      { label: "Paid", value: (row) => money(row.paidAmount) },
      { label: "Balance", value: (row) => money(row.balanceAmount) },
      { label: "Invoice Status", value: (row) => badge(row.status) },
      { label: "Payment Status", value: (row) => badge(row.paymentStatus) },
      { label: "Price Check", value: (row) => row.hasPriceChanges ? badge("prices changed") : "" },
      { label: "Actions", value: (row) => invoiceActions(row) }
    ],
    data.invoices,
    "No invoices yet. Create your first invoice to start billing customers."
  )));
  document.querySelector("[data-add-invoice]").addEventListener("click", () => openInvoiceForm());
  document.querySelector("[data-export-invoices]").addEventListener("click", () => window.open("/api/exports/invoices/csv", "_blank"));
  bindInvoiceActions(data.invoices);
}

function invoiceActions(row) {
  return `<div class="actions">
    ${row.status === "DRAFT" ? `<button class="button" data-issue-invoice="${row.id}">Issue</button>` : ""}
    ${row.status === "DRAFT" && row.hasPriceChanges ? `<button class="button" data-refresh-invoice="${row.id}">Update Draft Prices</button>` : ""}
    <button class="button" data-print-invoice="${row.id}">Print</button>
    <button class="button" data-pdf-invoice="${row.id}">Download PDF</button>
    ${numberValue(row.balanceAmount) > 0 ? `<button class="button" data-pay-invoice="${row.id}">Payment</button>` : ""}
  </div>`;
}

function bindInvoiceActions(invoices) {
  document.querySelectorAll("[data-issue-invoice]").forEach((button) => button.addEventListener("click", () => confirmAction("Issue this invoice and reduce stock?", async () => api(`/api/invoices/${button.dataset.issueInvoice}/issue`, { method: "PATCH", body: {} }))));
  document.querySelectorAll("[data-refresh-invoice]").forEach((button) => button.addEventListener("click", () => confirmAction("Product prices have changed since this draft was created. Update this draft with latest product prices?", async () => api(`/api/invoices/${button.dataset.refreshInvoice}/refresh-prices`, { method: "PATCH", body: {} }))));
  document.querySelectorAll("[data-print-invoice]").forEach((button) => button.addEventListener("click", () => window.open(`/api/invoices/${button.dataset.printInvoice}/print`, "_blank")));
  document.querySelectorAll("[data-pdf-invoice]").forEach((button) => button.addEventListener("click", () => window.open(`/api/invoices/${button.dataset.pdfInvoice}/pdf`, "_blank")));
  document.querySelectorAll("[data-pay-invoice]").forEach((button) => button.addEventListener("click", () => {
    const invoice = invoices.find((item) => item.id === button.dataset.payInvoice);
    openPaymentForm({ customerId: invoice.customerId, invoiceId: invoice.id, amount: invoice.balanceAmount });
  }));
}

async function openInvoiceForm(defaults = {}) {
  const [customers, products, termTemplates] = await Promise.all([
    customerOptions(),
    productOptions({ sellableOnly: true }),
    masterOptions("invoiceTermTemplates", [])
  ]);
  openModal(
    "Create invoice",
    `<div class="form-grid">
      ${formSelect("customerId", "Customer", customers, defaults.customerId || "")}
      ${formInput("invoiceDate", "Invoice Date", today(), "date")}
      ${formInput("dueDate", "Due Date", "", "date")}
      ${formSelect("productId", "Item / Service", products, "")}
      ${formInput("quantity", "Quantity", 1, "number", "min='1' step='0.01' required")}
      ${formInput("unitPrice", "Latest Unit Price", currentInvoicePrice(products[0]?.product), "number", "step='0.01' min='0' required")}
      ${formInput("discount", "Discount", 0, "number", "step='0.01'")}
      ${formInput("tax", "Tax", 0, "number", "step='0.01'")}
      ${formSelect("termsTemplate", "Terms Template", [{ value: "", label: "Default terms" }, ...termTemplates], "")}
      ${formTextarea("terms", "Invoice Terms", state.settings?.terms || "")}
      ${formTextarea("itemsText", "Additional Items", "", "placeholder='SKU or exact name | quantity | optional unit price'")}
      ${formSelect("issueNow", "Issue Now", [{ value: "true", label: "Yes, issue invoice" }, { value: "false", label: "Save draft" }], "true")}
      ${formTextarea("notes", "Notes", "")}
    </div>`,
    async (form) => {
      const values = formValues(form);
      const product = products.find((item) => item.value === values.productId)?.product;
      const items = [
        { productId: values.productId, itemName: product?.invoiceDisplayName || product?.name, quantity: values.quantity, unitPrice: values.unitPrice },
        ...parseProductLines(values.itemsText, products, "invoice")
      ];
      await api("/api/invoices", {
        method: "POST",
        body: {
          customerId: values.customerId,
          invoiceDate: values.invoiceDate,
          dueDate: values.dueDate,
          discount: values.discount,
          tax: values.tax,
          issueNow: values.issueNow === "true",
          notes: values.notes,
          terms: values.terms,
          items
        }
      });
    }
  );
  const productSelect = modalRoot.querySelector("#productId");
  const unitPriceInput = modalRoot.querySelector("#unitPrice");
  const termsSelect = modalRoot.querySelector("#termsTemplate");
  const termsInput = modalRoot.querySelector("#terms");
  async function refreshSelectedProductPrice() {
    if (!productSelect.value) return;
    try {
      const latest = await api(`/api/products/${productSelect.value}`);
      unitPriceInput.value = currentInvoicePrice(latest.product);
    } catch {
      const product = products.find((item) => item.value === productSelect.value)?.product;
      unitPriceInput.value = currentInvoicePrice(product);
    }
  }
  productSelect.addEventListener("change", refreshSelectedProductPrice);
  termsSelect.addEventListener("change", () => {
    const template = termTemplates.find((item) => item.value === termsSelect.value);
    if (template?.description) termsInput.value = template.description;
  });
  await refreshSelectedProductPrice();
}

async function renderOrders() {
  setContent(pageShell("Orders", "Create orders, invoices, delivery links, and payments.", `<button class="button primary" data-add-order>Create Order</button>`));
  const data = await api("/api/orders");
  setContent(pageShell("Orders", "Create orders, invoices, delivery links, and payments.", `<button class="button primary" data-add-order>Create Order</button>`, table(
    [
      { label: "Order", value: (row) => `<strong>${escapeHtml(row.orderNumber)}</strong><br><small>${date(row.orderDate)}</small>` },
      { label: "Customer", value: (row) => escapeHtml(row.customer?.name || "") },
      { label: "Items", value: (row) => row.items.map((item) => `${escapeHtml(item.productName)} x ${item.quantity}`).join("<br>") },
      { label: "Total", value: (row) => `<span class="money">${money(row.total)}</span>` },
      { label: "Payment", value: (row) => badge(row.paymentStatus) },
      { label: "Delivery", value: (row) => badge(row.deliveryStatus) },
      { label: "Actions", value: (row) => orderActions(row) }
    ],
    data.orders,
    "Create an order after adding a customer and product."
  )));
  document.querySelector("[data-add-order]").addEventListener("click", () => openOrderForm());
  bindOrderActions(data.orders);
}

function orderActions(row) {
  return `
    <div class="actions">
      <button class="button" data-invoice="${row.id}">Invoice</button>
      <button class="button" data-delivery-order="${row.id}">Delivery</button>
      <button class="button" data-payment-order="${row.id}">Payment</button>
      <button class="button" data-repeat-order="${row.id}">Repeat</button>
      <button class="button danger" data-cancel-order="${row.id}">Cancel</button>
    </div>
  `;
}

function bindOrderActions(orders) {
  document.querySelectorAll("[data-invoice]").forEach((button) => button.addEventListener("click", () => window.open(`/api/orders/${button.dataset.invoice}/invoice/print`, "_blank")));
  document.querySelectorAll("[data-delivery-order]").forEach((button) => button.addEventListener("click", () => openDeliveryForm({ orderId: button.dataset.deliveryOrder })));
  document.querySelectorAll("[data-payment-order]").forEach((button) => {
    button.addEventListener("click", () => {
      const order = orders.find((item) => item.id === button.dataset.paymentOrder);
      openPaymentForm({ customerId: order.customerId, orderId: order.id });
    });
  });
  document.querySelectorAll("[data-repeat-order]").forEach((button) => button.addEventListener("click", () => confirmAction("Repeat this order with today's date?", async () => api(`/api/orders/${button.dataset.repeatOrder}/repeat`, { method: "POST", body: {} }))));
  document.querySelectorAll("[data-cancel-order]").forEach((button) => button.addEventListener("click", () => confirmAction("Cancel this order and restore its stock?", async () => api(`/api/orders/${button.dataset.cancelOrder}/cancel`, { method: "PATCH", body: {} }))));
}

async function openOrderForm(defaults = {}) {
  const [customers, products] = await Promise.all([customerOptions(), productOptions({ sellableOnly: true })]);
  openModal(
    "Create order",
    `<div class="form-grid">
      ${formSelect("customerId", "Customer", customers, defaults.customerId || "")}
      ${formInput("orderDate", "Order date", today(), "date")}
      ${formSelect("productId", "Product", products, "")}
      ${formInput("quantity", "Quantity", 1, "number", "min='1'")}
      ${formInput("unitPrice", "Unit price", products[0]?.product?.standardServiceCharge || products[0]?.product?.sellingPrice || products[0]?.product?.unitPrice || 0, "number", "step='0.01'")}
      ${formInput("discount", "Discount", 0, "number", "step='0.01'")}
      ${formInput("tax", "Tax", 0, "number", "step='0.01'")}
      ${formInput("deliveryAddress", "Delivery address", "")}
      ${formTextarea("notes", "Notes", "")}
    </div>`,
    async (form) => {
      const values = formValues(form);
      const product = products.find((item) => item.value === values.productId)?.product;
      await api("/api/orders", {
        method: "POST",
        body: {
          customerId: values.customerId,
          orderDate: values.orderDate,
          discount: values.discount,
          tax: values.tax,
          deliveryAddress: values.deliveryAddress,
          notes: values.notes,
          items: [{ productId: values.productId, productName: product?.name, quantity: values.quantity, unitPrice: values.unitPrice }]
        }
      });
    }
  );
}

async function renderDeliveries() {
  setContent(pageShell("Deliveries", "Track scheduled, in-progress, and completed deliveries.", `<button class="button primary" data-add-delivery>Create Delivery</button>`));
  const data = await api("/api/deliveries");
  setContent(pageShell("Deliveries", "Track scheduled, in-progress, and completed deliveries.", `<button class="button primary" data-add-delivery>Create Delivery</button>`, table(
    [
      { label: "Delivery", value: (row) => `<strong>${escapeHtml(row.deliveryNumber)}</strong><br><small>${date(row.scheduledDate)}</small>` },
      { label: "Order", value: (row) => escapeHtml(row.order?.orderNumber || "") },
      { label: "Customer", value: (row) => escapeHtml(row.customer?.name || "") },
      { label: "Address", value: (row) => escapeHtml(row.address) },
      { label: "Status", value: (row) => badge(row.status) },
      { label: "Actions", value: (row) => `<button class="button" data-status-delivery="${row.id}">Update Status</button>` }
    ],
    data.deliveries,
    "Create deliveries from existing orders."
  )));
  document.querySelector("[data-add-delivery]").addEventListener("click", () => openDeliveryForm());
  document.querySelectorAll("[data-status-delivery]").forEach((button) => button.addEventListener("click", () => openDeliveryStatus(button.dataset.statusDelivery)));
}

async function openDeliveryForm(defaults = {}) {
  const orderData = await api("/api/orders");
  const orderOptions = orderData.orders.map((order) => ({ value: order.id, label: `${order.orderNumber} - ${order.customer?.name || ""}` }));
  openModal(
    "Create delivery",
    `<div class="form-grid">
      ${formSelect("orderId", "Order", orderOptions, defaults.orderId || "")}
      ${formInput("scheduledDate", "Scheduled date", today(), "date")}
      ${formSelect("status", "Status", [{ value: "scheduled", label: "Scheduled" }, { value: "in_progress", label: "In Progress" }, { value: "completed", label: "Completed" }], "scheduled")}
      ${formInput("address", "Delivery address", "")}
      ${formTextarea("notes", "Notes", "")}
    </div>`,
    async (form) => api("/api/deliveries", { method: "POST", body: formValues(form) })
  );
}

function openDeliveryStatus(deliveryId) {
  openModal(
    "Update delivery status",
    `<div class="form-grid">
      ${formSelect("status", "Status", [{ value: "scheduled", label: "Scheduled" }, { value: "in_progress", label: "In Progress" }, { value: "completed", label: "Completed" }, { value: "failed", label: "Failed" }], "completed")}
      ${formInput("completedDate", "Completed date", today(), "date")}
    </div>`,
    async (form) => api(`/api/deliveries/${deliveryId}/status`, { method: "PATCH", body: formValues(form) })
  );
}

async function renderPayments() {
  setContent(pageShell("Payments", "Record customer payments and issue receipts.", `<button class="button primary" data-add-payment>Add Payment</button><button class="button" data-export-payments>Export CSV</button>`));
  const data = await api("/api/payments");
  setContent(pageShell("Payments", "Record customer payments and issue receipts.", `<button class="button primary" data-add-payment>Add Payment</button><button class="button" data-export-payments>Export CSV</button>`, table(
    [
      { label: "Receipt", value: (row) => `<strong>${escapeHtml(row.receiptNumber)}</strong><br><small>${date(row.paymentDate)}</small>` },
      { label: "Customer", value: (row) => escapeHtml(row.customer?.name || "") },
      { label: "Invoice", value: (row) => escapeHtml(row.invoice?.invoiceNumber || row.order?.orderNumber || "") },
      { label: "Amount", value: (row) => `<span class="money">${money(row.amount)}</span>` },
      { label: "Method", value: (row) => badge(row.paymentMethod || row.method) },
      { label: "Actions", value: (row) => `<button class="button" data-receipt="${row.id}">Print</button> <button class="button" data-pdf-receipt="${row.id}">Download PDF</button>` }
    ],
    data.payments,
    "No payments recorded yet."
  )));
  document.querySelector("[data-add-payment]").addEventListener("click", () => openPaymentForm());
  document.querySelector("[data-export-payments]").addEventListener("click", () => window.open("/api/exports/payments/csv", "_blank"));
  document.querySelectorAll("[data-receipt]").forEach((button) => button.addEventListener("click", () => window.open(`/api/payments/${button.dataset.receipt}/receipt/print`, "_blank")));
  document.querySelectorAll("[data-pdf-receipt]").forEach((button) => button.addEventListener("click", () => window.open(`/api/payments/${button.dataset.pdfReceipt}/receipt/pdf`, "_blank")));
}

async function openPaymentForm(defaults = {}) {
  const [customers, orders, invoices, methods] = await Promise.all([
    customerOptions(),
    api("/api/orders"),
    api("/api/invoices"),
    masterOptions("paymentMethods", [
      { value: "CASH", label: "Cash" },
      { value: "BANK_TRANSFER", label: "Bank Transfer" },
      { value: "CARD", label: "Card" },
      { value: "MOBILE_WALLET", label: "Mobile Wallet" },
      { value: "OTHER", label: "Other" }
    ])
  ]);
  const orderOptions = [{ value: "", label: "No specific order" }, ...orders.orders.map((order) => ({ value: order.id, label: `${order.orderNumber} - ${order.customer?.name || ""}` }))];
  const payableInvoices = invoices.invoices.filter((invoice) => numberValue(invoice.balanceAmount) > 0.001 || invoice.id === defaults.invoiceId);
  const invoiceById = new Map(payableInvoices.map((invoice) => [invoice.id, invoice]));
  const selectedInvoice = invoiceById.get(defaults.invoiceId);
  const selectedCustomerId = selectedInvoice?.customerId || defaults.customerId || "";
  const invoiceOptionsFor = (customerId, selectedId = "") => [
    { value: "", label: "No specific invoice" },
    ...payableInvoices
      .filter((invoice) => !customerId || invoice.customerId === customerId || invoice.id === selectedId)
      .map((invoice) => ({ value: invoice.id, label: `${invoice.invoiceNumber} - ${invoice.customer?.name || ""} - balance ${money(invoice.balanceAmount)}` }))
  ];
  openModal(
    "Record Payment",
    `<div class="form-grid">
      ${formSelect("customerId", "Customer", customers, selectedCustomerId)}
      ${formSelect("invoiceId", "Invoice optional", invoiceOptionsFor(selectedCustomerId, defaults.invoiceId), defaults.invoiceId || "")}
      ${formSelect("orderId", "Order optional", orderOptions, defaults.orderId || "")}
      <div class="payment-summary wide" data-invoice-payment-summary></div>
      ${formInput("amount", "Payment Amount", selectedInvoice ? inputNumber(selectedInvoice.balanceAmount) : inputNumber(defaults.amount), "number", "step='0.01' min='0.01' required")}
      <div class="field wide"><small class="validation-message" data-payment-validation></small></div>
      ${formSelect("paymentMethod", "Method", methods, "CASH")}
      ${formInput("paymentDate", "Payment date", today(), "date")}
      ${formTextarea("notes", "Notes", "")}
    </div>`,
    async (form) => {
      const values = formValues(form);
      const amount = numberValue(values.amount);
      const invoice = invoiceById.get(values.invoiceId);
      if (amount <= 0) throw new Error("Payment amount must be greater than 0.");
      if (invoice && amount > numberValue(invoice.balanceAmount) + 0.001) throw new Error(`Payment amount cannot exceed the invoice balance of ${money(invoice.balanceAmount)}.`);
      if (invoice) values.customerId = invoice.customerId;
      await api("/api/payments", { method: "POST", body: values });
    }
  );

  const customerSelect = modalRoot.querySelector("#customerId");
  const invoiceSelect = modalRoot.querySelector("#invoiceId");
  const amountInput = modalRoot.querySelector("#amount");
  const summary = modalRoot.querySelector("[data-invoice-payment-summary]");
  const validation = modalRoot.querySelector("[data-payment-validation]");
  const submit = modalRoot.querySelector("button[type='submit']");

  function renderInvoiceOptions() {
    const selectedId = invoiceSelect.value;
    const options = invoiceOptionsFor(customerSelect.value, selectedId);
    invoiceSelect.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(selectedId) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
    if (!options.some((option) => String(option.value) === String(selectedId))) invoiceSelect.value = "";
  }

  function selectedInvoiceData() {
    return invoiceById.get(invoiceSelect.value);
  }

  function renderPaymentSummary(autofill = false) {
    const invoice = selectedInvoiceData();
    if (invoice) {
      customerSelect.value = invoice.customerId;
      if (autofill) amountInput.value = inputNumber(invoice.balanceAmount);
      const amount = numberValue(amountInput.value);
      const balanceAfter = Math.max(0, numberValue(invoice.balanceAmount) - amount);
      summary.innerHTML = `
        <div class="summary-title">Invoice Payment Summary</div>
        <div class="summary-grid">
          <div><span>Invoice Total</span><strong>${money(invoice.totalAmount)}</strong></div>
          <div><span>Already Paid</span><strong>${money(invoice.paidAmount)}</strong></div>
          <div><span>Balance Due</span><strong>${money(invoice.balanceAmount)}</strong></div>
          <div><span>Balance After Payment</span><strong>${money(balanceAfter)}</strong></div>
        </div>
      `;
      const invalid = amount <= 0 || amount > numberValue(invoice.balanceAmount) + 0.001;
      validation.textContent = amount <= 0
        ? "Amount must be greater than 0."
        : amount > numberValue(invoice.balanceAmount) + 0.001
          ? `Amount exceeds the invoice balance of ${money(invoice.balanceAmount)}.`
          : "";
      validation.classList.toggle("active", invalid);
      submit.disabled = invalid;
    } else {
      summary.innerHTML = `<div class="summary-title">Invoice Payment Summary</div><p>Select an invoice to auto-fill the remaining balance and preview the balance after payment.</p>`;
      const invalid = numberValue(amountInput.value) <= 0;
      validation.textContent = invalid ? "Amount must be greater than 0." : "";
      validation.classList.toggle("active", invalid);
      submit.disabled = invalid;
    }
  }

  customerSelect.addEventListener("change", () => {
    const invoice = selectedInvoiceData();
    if (invoice && customerSelect.value && invoice.customerId !== customerSelect.value) invoiceSelect.value = "";
    renderInvoiceOptions();
    renderPaymentSummary(false);
  });
  invoiceSelect.addEventListener("change", () => {
    const invoice = selectedInvoiceData();
    if (invoice) customerSelect.value = invoice.customerId;
    renderInvoiceOptions();
    renderPaymentSummary(true);
  });
  amountInput.addEventListener("input", () => renderPaymentSummary(false));
  renderPaymentSummary(Boolean(selectedInvoice));
}

async function renderExpenses() {
  setContent(pageShell("Expenses", "Track daily and monthly business spending.", `<button class="button primary" data-add-expense>Add Expense</button><button class="button" data-export-expenses>Export CSV</button>`));
  const data = await api("/api/expenses");
  setContent(pageShell("Expenses", "Track daily and monthly business spending.", `<button class="button primary" data-add-expense>Add Expense</button><button class="button" data-export-expenses>Export CSV</button>`, table(
    [
      { label: "Title", value: (row) => `<strong>${escapeHtml(row.title)}</strong><br><small>${escapeHtml(row.category)}</small>` },
      { label: "Amount", value: (row) => `<span class="money">${money(row.amount)}</span>` },
      { label: "Method", value: (row) => badge(row.paymentMethod || row.method || "CASH") },
      { label: "Date", value: (row) => date(row.expenseDate) },
      { label: "Receipt", value: (row) => row.receiptFileId ? `<a href="/api/uploads/${escapeHtml(row.receiptFileId)}" target="_blank">${escapeHtml(row.receiptFileName || "Open receipt")}</a>` : "" },
      { label: "Notes", value: (row) => escapeHtml(row.notes) },
      { label: "Actions", value: (row) => `<button class="button" data-edit-expense="${row.id}">Edit</button> <button class="button danger" data-archive-expense="${row.id}">Archive</button>` }
    ],
    data.expenses,
    "No expenses recorded yet."
  )));
  document.querySelector("[data-add-expense]").addEventListener("click", () => openExpenseForm());
  document.querySelector("[data-export-expenses]").addEventListener("click", () => window.open("/api/exports/expenses/csv", "_blank"));
  document.querySelectorAll("[data-edit-expense]").forEach((button) => button.addEventListener("click", () => openExpenseForm(data.expenses.find((item) => item.id === button.dataset.editExpense))));
  document.querySelectorAll("[data-archive-expense]").forEach((button) => button.addEventListener("click", () => confirmAction("Archive this expense? It will move to the recycle bin.", async () => api(`/api/expenses/${button.dataset.archiveExpense}/archive`, { method: "PATCH", body: {} }))));
}

async function openExpenseForm(expense = {}) {
  const [categories, methods] = await Promise.all([
    masterOptions("expenseCategories", [
      { value: "rent", label: "Rent" },
      { value: "utilities", label: "Utilities" },
      { value: "labor", label: "Labor" },
      { value: "transport", label: "Transport" },
      { value: "repair", label: "Repair" },
      { value: "marketing", label: "Marketing" },
      { value: "miscellaneous", label: "Miscellaneous" }
    ]),
    masterOptions("paymentMethods", [
      { value: "CASH", label: "Cash" },
      { value: "BANK_TRANSFER", label: "Bank Transfer" },
      { value: "CARD", label: "Card" },
      { value: "MOBILE_WALLET", label: "Mobile Wallet" },
      { value: "OTHER", label: "Other" }
    ])
  ]);
  const hasReceipt = Boolean(expense.receiptFileId);
  openModal(
    expense.id ? "Edit expense" : "Add expense",
    `<div class="form-grid">
      ${formInput("title", "Expense title", expense.title || "", "text", "required")}
      ${formSelect("category", "Category", categories, expense.category || categories[0]?.value || "miscellaneous")}
      ${formInput("amount", "Amount", expense.amount || 0, "number", "step='0.01' required")}
      ${formSelect("paymentMethod", "Payment Method", methods, expense.paymentMethod || expense.method || "CASH")}
      ${formInput("expenseDate", "Expense date", expense.expenseDate || today(), "date")}
      <div class="field wide">
        <label for="receiptFile">${hasReceipt ? "Replace receipt attachment" : "Receipt attachment"}</label>
        ${hasReceipt ? `
          <div class="attachment-control">
            <div>
              <strong>${escapeHtml(expense.receiptFileName || "Current receipt")}</strong>
              <small>Existing attachment</small>
            </div>
            <div class="actions">
              <a class="button" href="/api/uploads/${escapeHtml(expense.receiptFileId)}" target="_blank" rel="noopener">View</a>
              <button class="button danger" type="button" data-remove-expense-attachment>Remove</button>
            </div>
          </div>
        ` : ""}
        <input id="receiptFile" name="receiptFile" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf">
        <small>${hasReceipt ? "Choose a new file to replace the current receipt." : "Optional receipt image or PDF."}</small>
      </div>
      ${formTextarea("notes", "Notes", expense.notes || "")}
    </div>`,
    async (form) => {
      const values = formValues(form);
      const receipt = form.querySelector("#receiptFile")?.files?.[0];
      delete values.receiptFile;
      if (receipt) {
        const uploaded = await uploadFormFile(receipt, "expense", expense.id || "");
        values.receiptFileId = uploaded.file.id;
        values.receiptFileName = uploaded.file.originalName;
      } else if (expense.receiptFileId) {
        values.receiptFileId = expense.receiptFileId;
        values.receiptFileName = expense.receiptFileName || "";
      }
      if (expense.id) await api(`/api/expenses/${expense.id}`, { method: "PATCH", body: values });
      else await api("/api/expenses", { method: "POST", body: values });
    }
  );
  if (hasReceipt && expense.id) {
    modalRoot.querySelector("[data-remove-expense-attachment]")?.addEventListener("click", () => confirmAction(
      "Remove this receipt attachment from the expense? The expense record will remain.",
      async () => api(`/api/expenses/${expense.id}/attachment`, { method: "DELETE", body: {} }),
      { title: "Remove attachment?", submitLabel: "Remove Attachment", danger: true }
    ));
  }
}

async function renderReports() {
  const from = monthStart();
  const to = today();
  setContent(pageShell("Reports", "Inventory, production, purchases, invoices, payments, expenses, and profit reporting.", `<button class="button" data-print-report>Print</button><button class="button" data-export-report>Export CSV</button>`, `<div class="loading">Generating report...</div>`));
  const data = await api(`/api/reports/summary?from=${from}&to=${to}`);
  renderReportData(data.report, from, to);
}

function renderReportData(report, from, to) {
  const totals = report.totals;
  const max = Math.max(totals.sales, totals.paymentsCollected, totals.expenseTotal, totals.estimatedProfit, 1);
  setContent(pageShell("Reports", "Inventory, production, purchases, invoices, payments, expenses, and profit reporting.", `<button class="button" data-run-report>Apply Filters</button><button class="button" data-print-report>Print</button><button class="button" data-export-report>Export CSV</button><button class="button" data-export-report-xlsx>Export Excel</button><button class="button" data-export-report-pdf>Download PDF</button>`, `
    <div class="panel">
      <div class="filters">
        ${formInput("reportFrom", "From", from, "date")}
        ${formInput("reportTo", "To", to, "date")}
      </div>
      ${[
        ["Sales", totals.sales],
        ["Payments Collected", totals.paymentsCollected],
        ["Purchases", totals.purchaseTotal],
        ["Expenses", totals.expenseTotal],
        ["Estimated Profit", totals.estimatedProfit],
        ["Outstanding Balance", totals.outstandingBalance]
      ].map(([label, value]) => `<div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, Math.min(100, (Number(value) / max) * 100))}%"></div></div><span class="money">${money(value)}</span></div>`).join("")}
      <div class="actions" style="margin-top:14px;">
        ${["product-stock", "raw-material-stock", "low-stock", "inventory-movements", "production", "purchases", "invoices", "payments", "customer-balances", "sales", "expenses", "profit"].map((type) => `<button class="button" data-named-report="${type}">${type.replaceAll("-", " ")}</button>`).join("")}
      </div>
    </div>
    <div class="split-grid" style="margin-top:14px;">
      <section class="panel"><h3>Top Customers</h3>${table([{ label: "Customer", value: "customerName" }, { label: "Orders", value: "orders" }, { label: "Total", value: (row) => money(row.total) }], report.topCustomers, "No customer sales in this range.")}</section>
      <section class="panel"><h3>Top Products</h3>${table([{ label: "Product", value: "productName" }, { label: "Qty", value: "quantity" }, { label: "Total", value: (row) => money(row.total) }], report.topProducts, "No product sales in this range.")}</section>
    </div>
  `));
  document.querySelector("[data-run-report]").addEventListener("click", async () => {
    const nextFrom = document.querySelector("#reportFrom").value;
    const nextTo = document.querySelector("#reportTo").value;
    const data = await api(`/api/reports/summary?from=${nextFrom}&to=${nextTo}`);
    renderReportData(data.report, nextFrom, nextTo);
  });
  document.querySelector("[data-print-report]").addEventListener("click", () => window.open(`/api/reports/summary/print?from=${document.querySelector("#reportFrom").value}&to=${document.querySelector("#reportTo").value}`, "_blank"));
  document.querySelector("[data-export-report]").addEventListener("click", () => window.open(`/api/reports/summary/csv?from=${document.querySelector("#reportFrom").value}&to=${document.querySelector("#reportTo").value}`, "_blank"));
  document.querySelector("[data-export-report-xlsx]").addEventListener("click", () => window.open(`/api/reports/summary/xlsx?from=${document.querySelector("#reportFrom").value}&to=${document.querySelector("#reportTo").value}`, "_blank"));
  document.querySelector("[data-export-report-pdf]").addEventListener("click", () => window.open(`/api/reports/summary/pdf?from=${document.querySelector("#reportFrom").value}&to=${document.querySelector("#reportTo").value}`, "_blank"));
  document.querySelectorAll("[data-named-report]").forEach((button) => button.addEventListener("click", () => window.open(`/api/reports/export/pdf?type=${button.dataset.namedReport}&from=${document.querySelector("#reportFrom").value}&to=${document.querySelector("#reportTo").value}`, "_blank")));
}

async function renderNotifications() {
  setContent(pageShell("Notifications", "Owner alerts for orders, deliveries, payments, low stock, reports, and backups.", `<button class="button" data-mark-all>Mark All Read</button>`));
  const data = await api("/api/notifications");
  setContent(pageShell("Notifications", "Owner alerts for orders, deliveries, payments, low stock, reports, and backups.", `<button class="button" data-mark-all>Mark All Read</button>`, table(
    [
      { label: "Title", value: (row) => `<strong>${escapeHtml(row.title)}</strong><br><small>${escapeHtml(row.message)}</small>` },
      { label: "Type", value: "type" },
      { label: "State", value: (row) => row.readAt ? badge("read") : badge("unread") },
      { label: "Created", value: (row) => date(row.createdAt) },
      { label: "Actions", value: (row) => `<button class="button" data-read-notification="${row.id}">Read</button> <button class="button danger" data-delete-notification="${row.id}">Delete</button>` }
    ],
    data.notifications,
    "No notifications yet."
  )));
  document.querySelector("[data-mark-all]").addEventListener("click", async () => {
    await api("/api/notifications/mark-all-read", { method: "PATCH", body: {} });
    await renderNotifications();
  });
  document.querySelectorAll("[data-read-notification]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/notifications/${button.dataset.readNotification}/read`, { method: "PATCH", body: {} });
    await renderNotifications();
  }));
  document.querySelectorAll("[data-delete-notification]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/notifications/${button.dataset.deleteNotification}`, { method: "DELETE", body: {} });
    await renderNotifications();
  }));
}

async function renderSettings() {
  setContent(pageShell("Settings", "Business branding used across invoices, receipts, statements, reports, and exports."));
  await loadSettings();
  await loadMasterData(true);
  const [categoryData, dataManagement] = await Promise.all([
    api("/api/categories?includeArchived=true"),
    api("/api/data-management/summary")
  ]);
  const s = state.settings;
  setContent(pageShell("Settings", "Business branding used across invoices, receipts, statements, reports, and exports.", "", `
    <section class="panel">
      <h3>Business Profile</h3>
      <form data-settings-form>
      <div class="form-grid">
        ${formInput("businessName", "Visible business name", s.businessName || "DawnGas", "text", "required")}
        ${formInput("currency", "Currency", s.currency || "PKR")}
        ${formInput("phone", "Business phone", s.phone || "")}
        ${formInput("email", "Business email", s.email || "", "email")}
        ${formInput("address", "Business address", s.address || "")}
        ${formInput("taxNumber", "Tax or registration number", s.taxNumber || "")}
        ${formInput("invoicePrefix", "Invoice prefix", s.invoicePrefix || "INV")}
        ${formInput("receiptPrefix", "Receipt prefix", s.receiptPrefix || "RCT")}
        ${formInput("purchasePrefix", "Purchase prefix", s.purchasePrefix || "PUR")}
        ${formInput("productionPrefix", "Production prefix", s.productionPrefix || "PRD")}
        ${formInput("orderPrefix", "Order prefix", s.orderPrefix || "ORD")}
        ${formInput("deliveryPrefix", "Delivery prefix", s.deliveryPrefix || "DEL")}
        ${formInput("lowStockThreshold", "Default low stock threshold", s.lowStockThreshold || 5, "number", "min='0'")}
        ${formSelect("sidebarBrandMode", "Sidebar logo display", [{ value: "logo_only", label: "Show logo only" }, { value: "logo_name", label: "Show logo + business name" }], s.sidebarBrandMode || "logo_only")}
        ${formTextarea("paymentInstructions", "Payment instructions", s.paymentInstructions || "")}
        ${formTextarea("terms", "Invoice terms", s.terms || "")}
        ${formTextarea("invoiceFooterNote", "Invoice footer note", s.invoiceFooterNote || "")}
        ${formTextarea("reportFooterNote", "Report footer note", s.reportFooterNote || "")}
      </div>
      <div class="actions" style="margin-top:14px;"><button class="button primary">Save Settings</button></div>
    </form>
    </section>

    <section class="panel" style="margin-top:14px;">
      <h3>Logo Settings</h3>
      <div class="logo-settings">
        <div class="logo-preview" data-logo-preview>${s.logoUrl ? `<img src="${escapeHtml(s.logoUrl)}" alt="${escapeHtml(s.businessName || "DawnGas")}">` : `<strong>${escapeHtml(s.businessName || "DawnGas")}</strong>`}</div>
        <div class="grid">
          <div class="field">
            <label for="logoFile">Business logo</label>
            <input id="logoFile" type="file" accept=".png,.jpg,.jpeg,.webp,.svg" data-logo-file>
            <small>PNG, JPG, WEBP, or SVG. Maximum 5 MB.</small>
          </div>
          <div class="actions">
            <button class="button primary" type="button" data-upload-logo>Upload or Replace</button>
            <button class="button danger" type="button" data-remove-logo>Remove Logo</button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel" style="margin-top:14px;">
      <h3>Signature Settings</h3>
      <div class="logo-settings">
        <div class="logo-preview" data-signature-preview>${s.signatureFileId || s.signatureAttachmentId ? `<img src="/api/uploads/${escapeHtml(s.signatureFileId || s.signatureAttachmentId)}" alt="Signature preview">` : `<strong>No signature saved</strong>`}</div>
        <div class="grid">
          <div class="field">
            <label for="signatureFile">Invoice signature</label>
            <input id="signatureFile" type="file" accept=".png,.jpg,.jpeg,.webp" data-signature-file>
            <small>PNG, JPG, or WEBP. Maximum 5 MB.</small>
          </div>
          <div class="actions">
            <button class="button primary" type="button" data-upload-signature>Upload or Replace</button>
            <button class="button danger" type="button" data-remove-signature>Remove Signature</button>
          </div>
        </div>
      </div>
    </section>

    <section class="panel" style="margin-top:14px;">
      <h3>Brand Colors</h3>
      <form data-color-form>
        <div class="color-grid">
          ${colorField("primaryColor", "Primary color", s.primaryColor || "#13756D")}
          ${colorField("primaryHoverColor", "Primary hover color", s.primaryHoverColor || "#0F5F58")}
          ${colorField("secondaryColor", "Secondary color", s.secondaryColor || "#0F172A")}
          ${colorField("accentColor", "Accent color", s.accentColor || "#F59E0B")}
          ${colorField("sidebarBackgroundColor", "Sidebar background color", s.sidebarBackgroundColor || "#0F1A24")}
          ${colorField("sidebarActiveColor", "Sidebar active item color", s.sidebarActiveColor || "#1F2D3A")}
          ${colorField("buttonTextColor", "Button text color", s.buttonTextColor || "#FFFFFF")}
          ${colorField("pageBackgroundColor", "Page background color", s.pageBackgroundColor || "#F7FAFC")}
          ${colorField("cardBackgroundColor", "Card background color", s.cardBackgroundColor || "#FFFFFF")}
        </div>
        <div class="actions" style="margin-top:14px;">
          <button class="button primary">Save Changes</button>
          <button class="button" type="button" data-reset-colors>Reset Defaults</button>
        </div>
      </form>
    </section>

    ${renderDataManagementSettings(dataManagement.summary)}

    ${renderMasterDataSettings(categoryData.categories || [])}
  `));
  document.querySelector("[data-settings-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await api("/api/settings/branding", { method: "PATCH", body: formValues(event.currentTarget) });
    state.settings = result.settings;
    applyTheme(result.settings);
    toast("Settings saved.");
    await renderSettings();
  });
  bindColorSettings();
  bindLogoSettings();
  bindSignatureSettings();
  bindDataManagementSettings(dataManagement.summary);
  bindMasterDataSettings(categoryData.categories || []);
}

function renderDataManagementSettings(summary = {}) {
  const countTiles = (summary.groups || [])
    .filter((group) => group.count > 0)
    .slice(0, 12)
    .map((group) => `<div class="cleanup-count"><span>${escapeHtml(group.label)}</span><strong>${escapeHtml(group.count)}</strong></div>`)
    .join("");
  if (!summary.enabled) {
    return `
      <section class="panel data-management-panel" style="margin-top:14px;">
        <div class="section-heading">
          <div>
            <h3>Data Management</h3>
            <p class="page-subtitle">Cleanup tools are disabled unless explicitly enabled for production.</p>
          </div>
          ${badge(summary.environment || "production")}
        </div>
        <div class="dependency-warning">
          <h4>Data cleanup tools are disabled in production.</h4>
          <p>Set <code>ENABLE_DATA_CLEANUP=true</code> only for controlled maintenance when you intentionally need these tools.</p>
        </div>
      </section>
    `;
  }
  return `
    <section class="panel data-management-panel" style="margin-top:14px;">
      <div class="section-heading">
        <div>
          <h3>Data Management</h3>
          <p class="page-subtitle">Clean manually entered test data during setup without deleting the owner account. A safety backup is created before destructive cleanup by default.</p>
        </div>
        ${badge(summary.environment || "development")}
      </div>
      <div class="cleanup-count-grid">${countTiles || `<div class="empty compact">No business records found.</div>`}</div>
      <div class="form-grid cleanup-toolbar">
        ${formSelect("dataCleanupMode", "Cleanup type", [
          { value: "selected", label: "Delete selected records" },
          { value: "clear", label: "Clear all business data" },
          { value: "orphans", label: "Cleanup orphaned records" }
        ], "selected")}
        ${formToggle("cleanupCreateBackup", "Safety backup before cleanup", true, "Recommended. Cleanup stops if backup creation fails.")}
      </div>

      <div class="data-mode-panel" data-cleanup-panel="selected">
        <h4 class="section-mini-title">Cleanup Test Data</h4>
        <p class="page-subtitle">Select manually entered test records, preview dependencies, then delete them after confirmation. Linked dependencies can be included so test products do not leave broken invoice, stock, or production history.</p>
        <form data-selected-cleanup-form>
          <div class="actions" style="margin:12px 0;">
            ${formToggle("includeLinkedDependencies", "Include linked dependencies", true, "Recommended for test products with invoices, purchases, inventory movements, or production history.")}
          </div>
          <div class="cleanup-record-groups">
            ${(summary.groups || [])
              .filter((group) => group.records && group.records.length)
              .map((group) => `
                <details class="cleanup-group">
                  <summary><span>${escapeHtml(group.label)}</span><strong>${escapeHtml(group.count)}</strong></summary>
                  <div class="cleanup-record-list">
                    ${group.records.map((record) => `
                      <label class="cleanup-record">
                        <input type="checkbox" data-cleanup-record data-group="${escapeHtml(group.key)}" value="${escapeHtml(record.id)}">
                        <span><strong>${escapeHtml(record.label)}</strong>${record.details ? `<small>${escapeHtml(record.details)}</small>` : ""}</span>
                      </label>
                    `).join("")}
                  </div>
                </details>
              `).join("")}
          </div>
          <div data-selected-cleanup-preview class="empty compact">Select records and preview dependencies before deleting.</div>
          <div class="form-grid" style="margin-top:12px;">
            ${formInput("deleteSelectedConfirm", `Type ${summary.deleteSelectedConfirmationText || "DELETE SELECTED RECORDS"}`, "", "text")}
          </div>
          <div class="actions" style="margin-top:12px;">
            <button class="button" type="button" data-preview-selected-cleanup>Preview Dependencies</button>
            <button class="button danger" type="submit">Delete Selected Records</button>
          </div>
        </form>
      </div>

      <div class="data-mode-panel hide" data-cleanup-panel="clear">
        <h4 class="section-mini-title">Reset Business Data</h4>
        <div class="dependency-warning">
          <h4>Clear business data?</h4>
          <p>This permanently removes business records for setup/testing cleanup. Your owner login remains. A safety backup is created before cleanup.</p>
        </div>
        <form data-clear-business-form>
          <div class="form-grid">
            ${formToggle("keepBusinessSettings", "Keep business settings", true, "Preserves branding, document text, currency, and business profile.")}
            ${formToggle("keepMasterData", "Keep master data", true, "Preserves dropdown values and item type behavior.")}
            ${formToggle("keepUploadedLogo", "Keep uploaded logo and signature", true, "Preserves branding files referenced by settings.")}
            ${formToggle("keepBackupHistory", "Keep backup history", true, "Preserves existing backup records plus the new safety backup.")}
            ${formToggle("keepActivityLogs", "Keep activity logs", false, "Optional. A cleanup activity log is always created after cleanup.")}
            ${formToggle("keepRestoreLogs", "Keep restore logs", false, "Optional maintenance history.")}
            ${formInput("clearConfirm", `Type ${summary.confirmationText || "CLEAR BUSINESS DATA"}`, "", "text", "required")}
          </div>
          <div data-clear-business-preview class="cleanup-preview">
            ${(summary.groups || []).filter((group) => group.count > 0 && !["backups", "activityLogs", "restoreLogs", "reminderLogs"].includes(group.key)).map((group) => `<div><span>${escapeHtml(group.label)}</span><strong>${escapeHtml(group.count)}</strong></div>`).join("") || `<div>No business records found.</div>`}
          </div>
          <div class="actions" style="margin-top:12px;">
            <button class="button danger" type="submit">Clear Business Data</button>
          </div>
        </form>
      </div>

      <div class="data-mode-panel hide" data-cleanup-panel="orphans">
        <h4 class="section-mini-title">Orphaned Records Cleanup</h4>
        <p class="page-subtitle">Detect records such as inventory rows with missing products or notes and attachments whose parent record no longer exists.</p>
        <form data-orphan-cleanup-form>
          <div class="form-grid">
            ${formSelect("orphanAction", "Action", [{ value: "archive", label: "Archive orphaned records" }, { value: "delete", label: "Delete orphaned records" }], "archive")}
            ${formInput("orphanConfirm", `Type ${summary.orphanConfirmationText || "CLEAN ORPHANS"}`, "", "text")}
          </div>
          <div data-orphan-preview class="empty compact">Run detection to preview orphaned records.</div>
          <div class="actions" style="margin-top:12px;">
            <button class="button" type="button" data-detect-orphans>Detect Orphans</button>
            <button class="button danger" type="submit">Cleanup Orphans</button>
          </div>
        </form>
      </div>
    </section>
  `;
}

function selectedCleanupRecords() {
  const selected = {};
  document.querySelectorAll("[data-cleanup-record]:checked").forEach((input) => {
    selected[input.dataset.group] = selected[input.dataset.group] || [];
    selected[input.dataset.group].push(input.value);
  });
  return selected;
}

function renderSelectedCleanupPreview(preview = {}) {
  if (!preview.totalSelected) return `<div class="empty compact">No records selected.</div>`;
  const selected = (preview.selected || []).map((group) => `<li><span>${escapeHtml(group.label)}</span><strong>${escapeHtml(group.count)}</strong></li>`).join("");
  const dependencies = (preview.dependencies || []).length
    ? preview.dependencies.map((item) => `
      <div class="dependency-card">
        <strong>${escapeHtml(item.group)}: ${escapeHtml(item.label)}</strong>
        ${dependencySummaryHtml(item.dependencies || [])}
      </div>
    `).join("")
    : `<div class="empty compact">No protected dependencies found for the current selection.</div>`;
  return `
    <h4 class="section-mini-title">Selected records</h4>
    <ul class="dependency-list">${selected}</ul>
    <h4 class="section-mini-title">Dependency summary</h4>
    ${dependencies}
  `;
}

function renderOrphanPreview(orphans = []) {
  if (!orphans.length) return `<div class="empty compact">No orphaned records detected.</div>`;
  return `
    <div class="cleanup-preview">
      ${orphans.map((group) => `<div><span>${escapeHtml(group.label)}<small>${escapeHtml(group.suggestedAction || "")}</small></span><strong>${escapeHtml(group.count)}</strong></div>`).join("")}
    </div>
  `;
}

function bindDataManagementSettings(summary = {}) {
  if (!summary.enabled) return;
  const modeSelect = document.querySelector("#dataCleanupMode");
  const panels = document.querySelectorAll("[data-cleanup-panel]");
  const backupInput = document.querySelector("#cleanupCreateBackup");
  const createBackup = () => backupInput?.checked !== false;
  function showMode() {
    panels.forEach((panel) => panel.classList.toggle("hide", panel.dataset.cleanupPanel !== modeSelect.value));
  }
  modeSelect?.addEventListener("change", showMode);
  showMode();

  document.querySelector("[data-preview-selected-cleanup]")?.addEventListener("click", async () => {
    const form = document.querySelector("[data-selected-cleanup-form]");
    const values = formValues(form);
    const preview = await api("/api/data-management/preview-cleanup", {
      method: "POST",
      body: {
        selectedRecords: selectedCleanupRecords(),
        includeLinkedDependencies: values.includeLinkedDependencies === "true"
      }
    });
    document.querySelector("[data-selected-cleanup-preview]").innerHTML = renderSelectedCleanupPreview(preview.preview);
  });

  document.querySelector("[data-selected-cleanup-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const result = await api("/api/data-management/delete-selected", {
      method: "POST",
      body: {
        selectedRecords: selectedCleanupRecords(),
        includeLinkedDependencies: values.includeLinkedDependencies === "true",
        createBackup: createBackup(),
        confirm: values.deleteSelectedConfirm
      }
    });
    toast(result.message || "Selected records deleted.");
    await renderSettings();
  });

  document.querySelector("[data-clear-business-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const result = await api("/api/data-management/clear-business-data", {
      method: "POST",
      body: {
        createBackup: createBackup(),
        keepBusinessSettings: values.keepBusinessSettings === "true",
        keepMasterData: values.keepMasterData === "true",
        keepUploadedLogo: values.keepUploadedLogo === "true",
        keepBackupHistory: values.keepBackupHistory === "true",
        keepActivityLogs: values.keepActivityLogs === "true",
        keepRestoreLogs: values.keepRestoreLogs === "true",
        confirm: values.clearConfirm
      }
    });
    toast(result.message || "Business data cleared.");
    await loadMasterData(true);
    await loadSettings();
    await renderSettings();
  });

  document.querySelector("[data-detect-orphans]")?.addEventListener("click", async () => {
    const result = await api("/api/data-management/orphans");
    document.querySelector("[data-orphan-preview]").innerHTML = renderOrphanPreview(result.orphans || []);
  });

  document.querySelector("[data-orphan-cleanup-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const result = await api("/api/data-management/cleanup-orphans", {
      method: "POST",
      body: {
        action: values.orphanAction,
        createBackup: createBackup(),
        confirm: values.orphanConfirm
      }
    });
    toast(result.message || "Orphan cleanup complete.");
    document.querySelector("[data-orphan-preview]").innerHTML = renderOrphanPreview(result.orphans || []);
  });
}

const masterDataLabels = {
  itemTypes: "Item Types",
  unitsOfMeasure: "Units of Measure",
  paymentMethods: "Payment Methods",
  expenseCategories: "Expense Categories",
  storageLocations: "Storage Locations",
  invoiceTermTemplates: "Invoice Terms Templates",
  purchaseStatuses: "Purchase Statuses",
  taxRates: "Tax Rates"
};

function renderMasterDataSettings(categories) {
  const typeOptions = Object.entries(masterDataLabels).map(([value, label]) => ({ value, label }));
  const categoryRows = categories.map((category) => ({
    ...category,
    status: category.status || "ACTIVE",
    actions: `<button class="button" data-edit-category="${category.id}">Edit</button> ${category.status === "ARCHIVED" || category.archivedAt ? `<button class="button" data-restore-category="${category.id}">Restore</button>` : `<button class="button danger" data-archive-category="${category.id}">Archive</button>`}`
  }));
  return `
    <section class="panel" style="margin-top:14px;">
      <h3>Master Data</h3>
      <p class="page-subtitle">Manage dropdown values used in products, invoices, payments, expenses, and inventory.</p>
      <div class="split-grid" style="margin-top:14px;">
        <form data-master-form class="panel subtle-panel">
          <h3>Add Dropdown Value</h3>
          <div class="form-grid">
            ${formSelect("type", "Type", typeOptions, "expenseCategories")}
            ${formInput("label", "Label", "", "text", "required")}
            ${formInput("value", "Value / Code", "")}
            ${formInput("sortOrder", "Sort Order", 50, "number")}
            ${formTextarea("description", "Description", "")}
            <div class="wide" data-master-extra-fields></div>
          </div>
          <div class="actions" style="margin-top:14px;"><button class="button primary">Add Value</button></div>
        </form>
        <form data-category-form class="panel subtle-panel">
          <h3>Add Product Category</h3>
          <div class="form-grid">
            ${formInput("name", "Category Name", "", "text", "required")}
            ${formSelect("type", "Item Type", state.masterData?.itemTypes || itemTypeOptions, "FINISHED_PRODUCT")}
            ${formTextarea("description", "Description", "")}
          </div>
          <div class="actions" style="margin-top:14px;"><button class="button primary">Add Category</button></div>
        </form>
      </div>
      <div class="master-grid" style="margin-top:14px;">
        ${Object.entries(masterDataLabels)
          .map(([type, label]) => renderMasterDataTable(type, label, state.masterData?.[type] || []))
          .join("")}
        <section class="panel subtle-panel">
          <h3>Product Categories</h3>
          ${table(
            [
              { label: "Name", value: "name" },
              { label: "Type", value: (row) => displayItemType(row.type) },
              { label: "Status", value: (row) => badge(row.status) },
              { label: "Actions", value: "actions" }
            ],
            categoryRows,
            "No categories yet."
          )}
        </section>
      </div>
    </section>
  `;
}

function renderMasterDataTable(type, label, items) {
  const rows = items.map((item) => ({
    ...item.record,
    label: item.label,
    value: item.value,
    description: item.description,
    behavior: type === "itemTypes" ? behaviorBadges(item.record) : type === "storageLocations" || type === "unitsOfMeasure" ? (item.record.isDefault ? badge("default") : "") : escapeHtml(item.description || ""),
    actions: `
      <button class="button" data-edit-master="${item.record.id}">Edit</button>
      ${item.record.status === "ARCHIVED" || item.record.archivedAt ? `<button class="button" data-restore-master="${item.record.id}">Restore</button>` : `<button class="button danger" data-archive-master="${item.record.id}">Archive</button>`}
    `
  }));
  return `
    <section class="panel subtle-panel">
      <h3>${escapeHtml(label)}</h3>
      ${table(
        [
          { label: "Label", value: "label" },
          { label: "Value", value: "value" },
          { label: type === "itemTypes" ? "Behavior" : "Details", value: "behavior" },
          { label: "Status", value: (row) => badge(row.status || "ACTIVE") },
          { label: "Actions", value: "actions" }
        ],
        rows,
        `No ${label.toLowerCase()} yet.`
      )}
    </section>
  `;
}

function behaviorBadges(record = {}) {
  return [
    record.canTrackInventory ? "Inventory" : "",
    record.appearsInInvoices ? "Invoice" : "",
    record.appearsInPurchases ? "Purchase" : "",
    record.canBeProduced || record.canBeUsedInProduction ? "Production" : "",
    record.canHaveBillOfMaterials ? "BOM" : ""
  ].filter(Boolean).map((item) => badge(item)).join(" ");
}

function masterDataExtraFields(type, record = {}) {
  if (type === "itemTypes") {
    const b = { ...itemTypeBehavior(record.value || "FINISHED_PRODUCT"), ...record };
    return `
      ${formToggle("canTrackInventory", "Inventory", b.canTrackInventory, "Can create inventory records.")}
      ${formToggle("appearsInInvoices", "Invoice", b.appearsInInvoices, "Can be selected on invoices.")}
      ${formToggle("appearsInPurchases", "Purchase", b.appearsInPurchases, "Can be selected on purchases.")}
      ${formToggle("canBeProduced", "Can be Produced", b.canBeProduced, "Can be produced as a finished output.")}
      ${formToggle("canBeUsedInProduction", "Used in Production", b.canBeUsedInProduction, "Can be selected as a BOM component.")}
      ${formToggle("canHaveBillOfMaterials", "BOM", b.canHaveBillOfMaterials, "Can store bill of materials rows.")}
      ${formToggle("affectsInventoryOnInvoice", "Invoice changes stock", b.affectsInventoryOnInvoice, "Invoice issue reduces inventory.")}
      ${formToggle("affectsInventoryOnPurchase", "Purchase changes stock", b.affectsInventoryOnPurchase, "Purchase receipt increases inventory.")}
      ${formToggle("requiresCostPrice", "Requires cost price", b.requiresCostPrice, "Cost price is expected.")}
      ${formToggle("requiresSellingPrice", "Requires selling price", b.requiresSellingPrice, "Selling price or charge is expected.")}
      ${formInput("defaultUnitOfMeasure", "Default Unit", b.defaultUnitOfMeasure || "piece")}
    `;
  }
  if (type === "storageLocations") {
    return `${formInput("code", "Location Code", record.code || "")}${formToggle("isDefault", "Default location", record.isDefault || false, "Auto-select this location in new stock forms.")}`;
  }
  if (type === "unitsOfMeasure") {
    return `${formInput("symbol", "Symbol", record.symbol || "")}${formToggle("isDefault", "Default unit", record.isDefault || false, "Auto-select this unit when no item-specific default exists.")}`;
  }
  return "";
}

function allMasterRecords() {
  return Object.values(state.masterData || {}).flatMap((rows) => rows.map((row) => row.record));
}

function bindMasterDataSettings(categories) {
  const masterType = document.querySelector("[data-master-form] #type");
  const extraTarget = document.querySelector("[data-master-extra-fields]");
  const refreshExtra = () => {
    extraTarget.innerHTML = masterDataExtraFields(masterType.value);
  };
  masterType.addEventListener("change", refreshExtra);
  refreshExtra();
  document.querySelector("[data-master-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/api/master-data", { method: "POST", body: formValues(event.currentTarget) });
    toast("Master data added.");
    await renderSettings();
  });
  document.querySelector("[data-category-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/api/categories", { method: "POST", body: formValues(event.currentTarget) });
    toast("Category added.");
    await renderSettings();
  });
  document.querySelectorAll("[data-edit-master]").forEach((button) => {
    button.addEventListener("click", () => openMasterDataForm(allMasterRecords().find((item) => item.id === button.dataset.editMaster)));
  });
  document.querySelectorAll("[data-archive-master]").forEach((button) => {
    button.addEventListener("click", () => confirmAction("Archive this dropdown value?", async () => api(`/api/master-data/${button.dataset.archiveMaster}/archive`, { method: "PATCH", body: {} })));
  });
  document.querySelectorAll("[data-restore-master]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/master-data/${button.dataset.restoreMaster}/restore`, { method: "PATCH", body: {} });
      await renderSettings();
    });
  });
  document.querySelectorAll("[data-edit-category]").forEach((button) => {
    button.addEventListener("click", () => openCategoryForm(categories.find((item) => item.id === button.dataset.editCategory)));
  });
  document.querySelectorAll("[data-archive-category]").forEach((button) => {
    button.addEventListener("click", () => confirmAction("Archive this category? Existing products keep their history.", async () => api(`/api/categories/${button.dataset.archiveCategory}/archive`, { method: "PATCH", body: {} })));
  });
  document.querySelectorAll("[data-restore-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/categories/${button.dataset.restoreCategory}/restore`, { method: "PATCH", body: {} });
      await renderSettings();
    });
  });
}

function openMasterDataForm(record) {
  if (!record) return;
  openModal(
    "Edit dropdown value",
    `<div class="form-grid">
      ${formInput("label", "Label", record.label || "", "text", "required")}
      ${formInput("value", "Value / Code", record.value || "", "text", record.isSystemDefault ? "disabled" : "")}
      ${formInput("sortOrder", "Sort Order", record.sortOrder || 50, "number")}
      ${formSelect("status", "Status", [{ value: "ACTIVE", label: "Active" }, { value: "ARCHIVED", label: "Archived" }], record.status || "ACTIVE")}
      ${formTextarea("description", "Description", record.description || "")}
      <div class="wide">${masterDataExtraFields(record.type, record)}</div>
    </div>`,
    async (form) => {
      const values = formValues(form);
      values.type = record.type;
      await api(`/api/master-data/${record.id}`, { method: "PATCH", body: values });
    }
  );
}

function openCategoryForm(category) {
  if (!category) return;
  openModal(
    "Edit category",
    `<div class="form-grid">
      ${formInput("name", "Category Name", category.name || "", "text", "required")}
      ${formSelect("type", "Item Type", state.masterData?.itemTypes || itemTypeOptions, category.type || "FINISHED_PRODUCT")}
      ${formSelect("status", "Status", [{ value: "ACTIVE", label: "Active" }, { value: "ARCHIVED", label: "Archived" }], category.status || "ACTIVE")}
      ${formTextarea("description", "Description", category.description || "")}
    </div>`,
    async (form) => api(`/api/categories/${category.id}`, { method: "PATCH", body: formValues(form) })
  );
}

function colorField(name, label, value) {
  const safe = escapeHtml(value);
  return `
    <div class="color-field" data-color-field="${name}">
      <label>${escapeHtml(label)}</label>
      <input type="color" value="${safe}" data-color-picker="${name}">
      <input type="text" name="${name}" value="${safe}" data-color-hex="${name}" pattern="^#[0-9A-Fa-f]{6}$">
      <span class="color-swatch" data-color-swatch="${name}" style="background:${safe}"></span>
    </div>
  `;
}

const defaultColors = {
  primaryColor: "#13756D",
  primaryHoverColor: "#0F5F58",
  secondaryColor: "#0F172A",
  accentColor: "#F59E0B",
  sidebarBackgroundColor: "#0F1A24",
  sidebarActiveColor: "#1F2D3A",
  buttonTextColor: "#FFFFFF",
  pageBackgroundColor: "#F7FAFC",
  cardBackgroundColor: "#FFFFFF"
};

function isHex(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || ""));
}

function bindColorSettings() {
  document.querySelectorAll("[data-color-picker]").forEach((picker) => {
    const name = picker.dataset.colorPicker;
    const hex = document.querySelector(`[data-color-hex="${name}"]`);
    const swatch = document.querySelector(`[data-color-swatch="${name}"]`);
    picker.addEventListener("input", () => {
      hex.value = picker.value.toUpperCase();
      swatch.style.background = picker.value;
    });
    hex.addEventListener("input", () => {
      if (isHex(hex.value)) {
        picker.value = hex.value;
        swatch.style.background = hex.value;
      }
    });
  });
  document.querySelector("[data-color-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const invalid = Object.entries(values).find(([, value]) => !isHex(value));
    if (invalid) {
      toast(`${invalid[0]} must be a valid hex color.`);
      return;
    }
    const result = await api("/api/settings/branding", { method: "PATCH", body: values });
    state.settings = result.settings;
    applyTheme(result.settings);
    toast("Brand colors saved.");
    await renderSettings();
  });
  document.querySelector("[data-reset-colors]").addEventListener("click", async () => {
    const result = await api("/api/settings/branding", { method: "PATCH", body: defaultColors });
    state.settings = result.settings;
    applyTheme(result.settings);
    toast("Brand colors reset.");
    await renderSettings();
  });
}

function bindLogoSettings() {
  const input = document.querySelector("[data-logo-file]");
  const preview = document.querySelector("[data-logo-preview]");
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("Logo must be 5 MB or smaller.");
      input.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="Logo preview">`;
  });
  document.querySelector("[data-upload-logo]").addEventListener("click", async () => {
    const file = input.files[0];
    if (!file) {
      toast("Choose a logo file first.");
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      toast("Use PNG, JPG, WEBP, or SVG.");
      return;
    }
    const data = await readFileData(file);
    const result = await api("/api/settings/logo", {
      method: "POST",
      body: { fileName: file.name, mimeType: file.type, data }
    });
    state.settings = result.settings;
    toast("Logo saved.");
    renderShell();
    await renderSettings();
  });
  document.querySelector("[data-remove-logo]").addEventListener("click", async () => {
    const result = await api("/api/settings/logo", { method: "DELETE", body: {} });
    state.settings = result.settings;
    toast("Logo removed.");
    renderShell();
    await renderSettings();
  });
}

function bindSignatureSettings() {
  const input = document.querySelector("[data-signature-file]");
  const preview = document.querySelector("[data-signature-preview]");
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("Signature must be 5 MB or smaller.");
      input.value = "";
      return;
    }
    preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Signature preview">`;
  });
  document.querySelector("[data-upload-signature]").addEventListener("click", async () => {
    const file = input.files[0];
    if (!file) {
      toast("Choose a signature file first.");
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast("Use PNG, JPG, or WEBP.");
      return;
    }
    const data = await readFileData(file);
    const result = await api("/api/settings/signature", {
      method: "POST",
      body: { fileName: file.name, mimeType: file.type, data }
    });
    state.settings = result.settings;
    toast("Signature saved.");
    await renderSettings();
  });
  document.querySelector("[data-remove-signature]").addEventListener("click", async () => {
    const result = await api("/api/settings/signature", { method: "DELETE", body: {} });
    state.settings = result.settings;
    toast("Signature removed.");
    await renderSettings();
  });
}

async function renderBackup() {
  setContent(pageShell("Backup", "Create authenticated JSON backups and restore validated backup data.", `<button class="button primary" data-create-backup>Create Backup</button>`));
  const data = await api("/api/backup");
  let validatedBackup = null;
  setContent(pageShell("Backup", "Create authenticated JSON backups and restore validated backup data.", `<button class="button primary" data-create-backup>Create Backup</button>`, `
    <section class="panel backup-help">
      <h3>How backups work</h3>
      <p class="page-subtitle">Backups export your DawnGas business records from MongoDB. JSON backups restore business records and file metadata. Uploaded physical files remain in configured storage and are not embedded in JSON backups. Secrets, .env files, MongoDB passwords, and node_modules are never included.</p>
    </section>
    <section class="panel" style="margin-top:14px;">
      <h3>Create Backup</h3>
      <div class="form-grid">
        ${formSelect("backupType", "Backup Type", [{ value: "json", label: "JSON Backup - business records" }, { value: "zip", label: "ZIP Backup - not enabled in local build" }], "json")}
        <div class="field">
          <label>Storage</label>
          <input value="Configured storage" disabled>
        </div>
      </div>
      <div class="actions" style="margin-top:14px;"><button class="button primary" data-create-backup-inline>Create Backup</button></div>
    </section>
    ${table(
      [
        { label: "File", value: (row) => `<span class="file-name" title="${escapeHtml(row.fileName)}">${escapeHtml(row.fileName)}</span>` },
        { label: "Size", value: (row) => `${Math.round(row.size / 1024)} KB` },
        { label: "Type", value: (row) => escapeHtml(row.type || "json") },
        { label: "Status", value: (row) => badge(row.status) },
        { label: "Created", value: (row) => date(row.createdAt) },
        { label: "Actions", value: (row) => `<a class="button" href="/api/backup/${row.id}/download" target="_blank">Download</a> <button class="button danger" data-delete-backup="${row.id}">Delete</button>` }
      ],
      data.backups,
      "No backups created yet."
    )}
    <section class="panel" style="margin-top:14px;">
      <h3>Restore backup</h3>
      <p class="page-subtitle">Restore validates a backup, creates an automatic safety backup of current data, replaces business records, and keeps the current owner login.</p>
      <form data-restore-form class="grid">
        <div class="field">
          <label for="backupFile">Upload backup JSON</label>
          <input id="backupFile" type="file" accept=".json" data-backup-file>
        </div>
        ${formTextarea("backupJson", "Paste backup JSON", "")}
        <div class="actions"><button class="button" type="button" data-validate-backup>Validate Backup</button></div>
        <div data-restore-preview class="empty">Validate a backup to preview collections, record counts, and warnings before restore.</div>
        ${formInput("confirm", "Confirmation", "")}
        <button class="button danger">Restore Backup</button>
      </form>
    </section>
  `));
  const createBackup = async () => {
    const backupType = document.querySelector("#backupType")?.value || "json";
    await api("/api/backup/create", { method: "POST", body: { backupType } });
    toast("Backup created.");
    await renderBackup();
  };
  document.querySelector("[data-create-backup]")?.addEventListener("click", createBackup);
  document.querySelector("[data-create-backup-inline]").addEventListener("click", createBackup);
  document.querySelectorAll("[data-delete-backup]").forEach((button) => {
    button.addEventListener("click", () => confirmAction("Delete this backup record? The downloaded file history will be hidden.", async () => api(`/api/backup/${button.dataset.deleteBackup}`, { method: "DELETE", body: {} })));
  });
  document.querySelector("[data-backup-file]").addEventListener("change", async (event) => {
    const file = event.currentTarget.files[0];
    if (!file) return;
    const text = await file.text();
    document.querySelector("#backupJson").value = text;
  });
  async function validateBackupFromForm() {
    const raw = document.querySelector("#backupJson").value;
    let backup;
    try {
      backup = JSON.parse(raw);
    } catch {
      validatedBackup = null;
      document.querySelector("[data-restore-preview]").innerHTML = errorState("Backup JSON is invalid. Choose or paste a valid DawnGas backup file.");
      return null;
    }
    try {
      const result = await api("/api/backup/validate", { method: "POST", body: { backup } });
      validatedBackup = backup;
      document.querySelector("[data-restore-preview]").innerHTML = renderBackupPreview(result.preview);
      return backup;
    } catch (error) {
      validatedBackup = null;
      document.querySelector("[data-restore-preview]").innerHTML = errorState(error);
      return null;
    }
  }
  document.querySelector("[data-validate-backup]").addEventListener("click", validateBackupFromForm);
  document.querySelector("[data-restore-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const backup = validatedBackup || (await validateBackupFromForm());
    if (!backup) return;
    await api("/api/backup/restore", { method: "POST", body: { confirm: values.confirm, backup } });
    toast("Backup restored.");
    await renderDashboard();
  });
}

function renderBackupPreview(preview = {}) {
  const counts = Object.entries(preview.collectionCounts || {});
  return `
    <div class="detail-list">
      <div class="detail-row"><span class="label">App</span><span>${escapeHtml(preview.appName || "")}</span></div>
      <div class="detail-row"><span class="label">Database</span><span>${escapeHtml(preview.dbName || "")}</span></div>
      <div class="detail-row"><span class="label">Generated</span><span>${escapeHtml(preview.generatedAt || "")}</span></div>
      <div class="detail-row"><span class="label">Format</span><span>${escapeHtml(preview.format || "")}</span></div>
    </div>
    ${table(
      [
        { label: "Collection", value: "collection" },
        { label: "Records", value: "count" }
      ],
      counts.map(([collection, count]) => ({ collection, count })),
      "No collection counts found."
    )}
    ${(preview.warnings || []).map((warning) => `<div class="empty compact">${escapeHtml(warning)}</div>`).join("")}
  `;
}

async function renderRecycle() {
  setContent(pageShell("Recycle Bin", "Restore archived records and protect financial history from unsafe permanent deletion."));
  const data = await api("/api/recycle-bin");
  setContent(pageShell("Recycle Bin", "Restore archived records and protect financial history from unsafe permanent deletion.", "", table(
    [
      { label: "Type", value: "type" },
      { label: "Record", value: (row) => escapeHtml(row.record.name || row.record.title || row.record.orderNumber || row.record.deliveryNumber || row.record.fileName || row.record.id) },
      { label: "Archived", value: (row) => date(row.record.archivedAt || row.record.deletedAt) },
      { label: "Actions", value: (row) => `<div class="actions"><button class="button" data-restore-type="${row.type}" data-restore-id="${row.record.id}">Restore</button><button class="button danger" data-delete-type="${row.type}" data-delete-id="${row.record.id}">Delete Permanently</button></div>` }
    ],
    data.items,
    "Recycle bin is empty."
  )));
  document.querySelectorAll("[data-restore-type]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/recycle-bin/${button.dataset.restoreType}/${button.dataset.restoreId}/restore`, { method: "POST", body: {} });
    await renderRecycle();
  }));
  document.querySelectorAll("[data-delete-type]").forEach((button) => button.addEventListener("click", () => confirmPermanentDelete(button.dataset.deleteType, button.dataset.deleteId)));
}

async function renderActivity() {
  setContent(pageShell("Activity Logs", "Owner audit trail for business actions."));
  const data = await api("/api/activity-logs");
  setContent(pageShell("Activity Logs", "Owner audit trail for business actions.", "", table(
    [
      { label: "Date", value: (row) => date(row.createdAt) },
      { label: "Action", value: "action" },
      { label: "Entity", value: (row) => `${escapeHtml(row.entityType)} / ${escapeHtml(row.entityId)}` },
      { label: "Description", value: (row) => escapeHtml(row.description) }
    ],
    data.activityLogs,
    "Activity logs will appear after actions are performed."
  )));
}

async function renderProfile() {
  setContent(pageShell("Profile", "Manage owner profile and password."));
  const data = await api("/api/profile");
  const p = data.profile;
  setContent(pageShell("Profile", "Manage owner profile and password.", "", `
    <div class="split-grid">
      <form class="panel" data-profile-form>
        <h3>Profile</h3>
        <div class="form-grid">
          ${formInput("name", "Name", p.name || "", "text", "required")}
          ${formInput("phone", "Phone", p.phone || "")}
          ${formInput("email", "Email", p.email || "", "email", "required")}
        </div>
        <div class="actions" style="margin-top:14px;"><button class="button primary">Save Profile</button></div>
      </form>
      <form class="panel" data-password-form>
        <h3>Change Password</h3>
        <div class="form-grid">
          ${formInput("oldPassword", "Current password", "", "password", "required")}
          ${formInput("newPassword", "New password", "", "password", "required minlength='8'")}
        </div>
        <div class="actions" style="margin-top:14px;"><button class="button primary">Change Password</button></div>
      </form>
    </div>
  `));
  document.querySelector("[data-profile-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await api("/api/profile", { method: "PATCH", body: formValues(event.currentTarget) });
    state.user = result.profile;
    toast("Profile saved.");
  });
  document.querySelector("[data-password-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    await api("/api/profile/change-password", { method: "POST", body: formValues(event.currentTarget) });
    toast("Password changed.");
    event.currentTarget.reset();
  });
}

function openWhatsApp(message) {
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}

async function createDocumentShareLink(payload) {
  const result = await api("/api/share-links", { method: "POST", body: payload });
  return result.shareLink;
}

async function shareDocumentOnWhatsApp(payload, buildMessage) {
  try {
    const shareLink = await createDocumentShareLink(payload);
    openWhatsApp(buildMessage(shareLink));
  } catch (error) {
    toast(error.message);
  }
}

function openNoteForm(entityType, entityId) {
  openModal(
    "Add note",
    `<div class="form-grid">
      ${formInput("title", "Title", "")}
      ${formTextarea("content", "Content", "", "required")}
    </div>`,
    async (form) => api("/api/notes", { method: "POST", body: { ...formValues(form), entityType, entityId } })
  );
}

function openAttachmentForm(entityType, entityId) {
  openModal(
    "Add attachment",
    `<div class="form-grid">
      ${formInput("label", "Label", "")}
      ${formInput("description", "Description", "")}
      <div class="field wide">
        <label for="file">File</label>
        <input id="file" name="file" type="file" required accept=".jpg,.jpeg,.png,.webp,.pdf,.csv,.xlsx">
      </div>
    </div>`,
    async (form) => {
      const values = formValues(form);
      const file = form.querySelector("input[type='file']").files[0];
      const data = await readFileData(file);
      await api("/api/attachments", {
        method: "POST",
        body: {
          entityType,
          entityId,
          label: values.label,
          description: values.description,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          data
        }
      });
    }
  );
}

function readFileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

async function uploadFormFile(file, entityType, entityId = "") {
  const data = await readFileData(file);
  return api("/api/uploads", {
    method: "POST",
    body: {
      entityType,
      entityId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      data
    }
  });
}

init().catch(renderStartupError);
