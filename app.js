const STORAGE_KEY = "coffee-community-data-v4";

const state = loadState();
let activeFilter = "all";

const currency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const elements = {
  totalContributions: document.querySelector("#totalContributions"),
  totalPurchases: document.querySelector("#totalPurchases"),
  cashBalance: document.querySelector("#cashBalance"),
  memberCount: document.querySelector("#memberCount"),
  memberForm: document.querySelector("#memberForm"),
  memberName: document.querySelector("#memberName"),
  memberList: document.querySelector("#memberList"),
  contributionForm: document.querySelector("#contributionForm"),
  contributionMember: document.querySelector("#contributionMember"),
  contributionAmount: document.querySelector("#contributionAmount"),
  contributionDate: document.querySelector("#contributionDate"),
  contributionNote: document.querySelector("#contributionNote"),
  purchaseForm: document.querySelector("#purchaseForm"),
  purchaseAmount: document.querySelector("#purchaseAmount"),
  purchaseDate: document.querySelector("#purchaseDate"),
  purchasePods: document.querySelector("#purchasePods"),
  purchaseBuyer: document.querySelector("#purchaseBuyer"),
  purchaseNote: document.querySelector("#purchaseNote"),
  ledger: document.querySelector("#ledger"),
  exportData: document.querySelector("#exportData"),
  importData: document.querySelector("#importData"),
  emptyStateTemplate: document.querySelector("#emptyStateTemplate"),
};

const today = new Date().toISOString().slice(0, 10);
elements.contributionDate.value = today;
elements.purchaseDate.value = today;

elements.memberForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.memberName.value.trim();
  if (!name) return;

  state.members.push({
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  });

  elements.memberName.value = "";
  persistAndRender();
});

elements.memberList.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  if (!action || !id) return;

  if (action === "delete") {
    const hasEntries = state.entries.some((entry) => entry.memberId === id || entry.buyerId === id);
    if (hasEntries && !confirm("Ce membre a déjà des mouvements. Le supprimer quand même ?")) {
      return;
    }
    state.members = state.members.filter((member) => member.id !== id);
  }

  persistAndRender();
});

elements.ledger.addEventListener("click", (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  if (action !== "delete-entry" || !id) return;
  if (!confirm("Supprimer cette ligne de l'historique ?")) return;

  state.entries = state.entries.filter((entry) => entry.id !== id);
  persistAndRender();
});

elements.contributionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = parseAmount(elements.contributionAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  state.entries.push({
    id: crypto.randomUUID(),
    type: "contribution",
    memberId: elements.contributionMember.value,
    amount,
    date: elements.contributionDate.value,
    note: elements.contributionNote.value.trim(),
    createdAt: new Date().toISOString(),
  });

  elements.contributionAmount.value = "";
  elements.contributionNote.value = "";
  persistAndRender();
});

elements.purchaseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = parseAmount(elements.purchaseAmount.value);
  const pods = parseInteger(elements.purchasePods.value);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(pods) || pods <= 0) return;

  state.entries.push({
    id: crypto.randomUUID(),
    type: "purchase",
    buyerId: elements.purchaseBuyer.value,
    amount,
    pods,
    date: elements.purchaseDate.value,
    note: elements.purchaseNote.value.trim(),
    createdAt: new Date().toISOString(),
  });

  elements.purchaseAmount.value = "";
  elements.purchasePods.value = "";
  elements.purchaseNote.value = "";
  persistAndRender();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeFilter = tab.dataset.filter;
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("is-active", item === tab));
    renderLedger();
  });
});

elements.exportData.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `coffee-community-${today}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

elements.importData.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.members) || !Array.isArray(imported.entries)) {
      throw new Error("Format invalide");
    }
    state.members = imported.members;
    state.entries = imported.entries;
    persistAndRender();
  } catch (error) {
    alert("Impossible d'importer ce fichier JSON.");
  } finally {
    event.target.value = "";
  }
});

function loadState() {
  const fallback = {
    members: [],
    entries: [],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.members) && Array.isArray(saved.entries)) {
      return saved;
    }
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }

  return fallback;
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function render() {
  renderSummary();
  renderMembers();
  renderSelects();
  renderLedger();
}

function renderSummary() {
  const totalContributions = sumEntries("contribution");
  const totalPurchases = sumEntries("purchase");

  elements.totalContributions.textContent = currency.format(totalContributions);
  elements.totalPurchases.textContent = currency.format(totalPurchases);
  elements.cashBalance.textContent = currency.format(totalContributions - totalPurchases);
  elements.memberCount.textContent = String(state.members.length);
}

function renderMembers() {
  elements.memberList.innerHTML = "";

  if (!state.members.length) {
    elements.memberList.append(emptyState());
    return;
  }

  state.members
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .forEach((member) => {
      const memberContributions = state.entries
        .filter((entry) => entry.type === "contribution" && entry.memberId === member.id)
        .reduce((total, entry) => total + Number(entry.amount), 0);

      const item = document.createElement("article");
      item.className = "member-item";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(member.name)}</strong>
          <span>${currency.format(memberContributions)} contribue</span>
        </div>
        <div class="member-actions">
          <button class="icon-button danger" type="button" data-action="delete" data-id="${member.id}" title="Supprimer">X</button>
        </div>
      `;
      elements.memberList.append(item);
    });
}

function renderSelects() {
  const options = state.members
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`)
    .join("");

  elements.contributionMember.innerHTML = options;
  elements.purchaseBuyer.innerHTML = options;
  const disabled = state.members.length === 0;
  elements.contributionForm.querySelector("button").disabled = disabled;
  elements.purchaseForm.querySelector("button").disabled = disabled;
}

function renderLedger() {
  elements.ledger.innerHTML = "";

  const visibleEntries = state.entries
    .filter((entry) => activeFilter === "all" || entry.type === activeFilter)
    .slice()
    .sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));

  if (!visibleEntries.length) {
    elements.ledger.append(emptyState());
    return;
  }

  visibleEntries.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "ledger-item";

    const member = findMember(entry.memberId || entry.buyerId);
    const title =
      entry.type === "contribution"
        ? `Contribution de ${member}`
        : `Achat par ${member}`;
    const amountClass = entry.type === "contribution" ? "amount-positive" : "amount-negative";
    const amountPrefix = entry.type === "contribution" ? "+" : "-";
    const details = [
      formatDate(entry.date),
      entry.type === "purchase" ? `${entry.pods} dosettes` : "",
      entry.note,
    ]
      .filter(Boolean)
      .join(" - ");

    item.innerHTML = `
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(details)}</span>
      </div>
      <div class="ledger-actions">
        <strong class="${amountClass}">${amountPrefix}${currency.format(entry.amount)}</strong>
        <button class="icon-button danger" type="button" data-action="delete-entry" data-id="${entry.id}" title="Supprimer">X</button>
      </div>
    `;
    elements.ledger.append(item);
  });
}

function sumEntries(type) {
  return state.entries
    .filter((entry) => entry.type === type)
    .reduce((total, entry) => total + Number(entry.amount), 0);
}

function parseAmount(value) {
  return Number(String(value).replace(",", "."));
}

function parseInteger(value) {
  return Number.parseInt(String(value), 10);
}

function findMember(id) {
  return state.members.find((member) => member.id === id)?.name || "Membre supprimé";
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

function emptyState() {
  return elements.emptyStateTemplate.content.firstElementChild.cloneNode(true);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
