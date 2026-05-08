const STORAGE_KEY = "coffee-community-data-v4";
const SUPABASE_CONFIG = window.COFFEE_COMMUNITY_SUPABASE || {};

const state = {
  members: [],
  entries: [],
};

let activeFilter = "all";
let supabaseClient = null;
let usingSupabase = false;

const currency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const elements = {
  totalContributions: document.querySelector("#totalContributions"),
  totalPurchases: document.querySelector("#totalPurchases"),
  cashBalance: document.querySelector("#cashBalance"),
  memberCount: document.querySelector("#memberCount"),
  syncStatus: document.querySelector("#syncStatus"),
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

elements.memberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = elements.memberName.value.trim();
  if (!name) return;

  await createMember(name);
  elements.memberName.value = "";
});

elements.memberList.addEventListener("click", async (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  if (!action || !id) return;

  if (action === "delete") {
    const hasEntries = state.entries.some((entry) => entry.memberId === id || entry.buyerId === id);
    if (hasEntries && !confirm("Ce membre a déjà des mouvements. Le supprimer quand même ?")) {
      return;
    }
    await deleteMember(id);
  }
});

elements.ledger.addEventListener("click", async (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  if (action !== "delete-entry" || !id) return;
  if (!confirm("Supprimer cette ligne de l'historique ?")) return;

  await deleteEntry(id);
});

elements.contributionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = parseAmount(elements.contributionAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  await createEntry({
    type: "contribution",
    memberId: elements.contributionMember.value,
    amount,
    date: elements.contributionDate.value,
    note: elements.contributionNote.value.trim(),
  });

  elements.contributionAmount.value = "";
  elements.contributionNote.value = "";
});

elements.purchaseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = parseAmount(elements.purchaseAmount.value);
  const pods = parseInteger(elements.purchasePods.value);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(pods) || pods <= 0) return;

  await createEntry({
    type: "purchase",
    buyerId: elements.purchaseBuyer.value,
    amount,
    pods,
    date: elements.purchaseDate.value,
    note: elements.purchaseNote.value.trim(),
  });

  elements.purchaseAmount.value = "";
  elements.purchasePods.value = "";
  elements.purchaseNote.value = "";
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
    await replaceAllData(imported);
  } catch (error) {
    alert("Impossible d'importer ce fichier JSON.");
  } finally {
    event.target.value = "";
  }
});

window.addEventListener("focus", () => {
  if (usingSupabase) {
    loadRemoteData();
  }
});

async function init() {
  supabaseClient = createSupabaseClient();
  usingSupabase = Boolean(supabaseClient);

  if (usingSupabase) {
    setSyncStatus("remote", "Synchronisé avec Supabase");
    await loadRemoteData();
    subscribeToRemoteChanges();
    return;
  }

  Object.assign(state, loadLocalState());
  setSyncStatus("local", "Stockage local");
  render();
}

function createSupabaseClient() {
  const url = String(SUPABASE_CONFIG.url || "").trim();
  const anonKey = String(SUPABASE_CONFIG.anonKey || "").trim();
  if (!url || !anonKey || !window.supabase?.createClient) return null;

  return window.supabase.createClient(url, anonKey);
}

async function loadRemoteData() {
  try {
    const [membersResult, entriesResult] = await Promise.all([
      supabaseClient.from("coffee_members").select("*").order("name", { ascending: true }),
      supabaseClient.from("coffee_entries").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);

    if (membersResult.error) throw membersResult.error;
    if (entriesResult.error) throw entriesResult.error;

    state.members = membersResult.data.map(fromRemoteMember);
    state.entries = entriesResult.data.map(fromRemoteEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSyncStatus("remote", "Synchronisé avec Supabase");
    render();
  } catch (error) {
    console.error(error);
    Object.assign(state, loadLocalState());
    setSyncStatus("error", "Supabase indisponible - stockage local");
    render();
  }
}

function subscribeToRemoteChanges() {
  supabaseClient
    .channel("coffee-community-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "coffee_members" }, loadRemoteData)
    .on("postgres_changes", { event: "*", schema: "public", table: "coffee_entries" }, loadRemoteData)
    .subscribe();
}

async function createMember(name) {
  const member = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  };

  if (usingSupabase) {
    await runRemoteMutation(() => supabaseClient.from("coffee_members").insert(toRemoteMember(member)));
    return;
  }

  state.members.push(member);
  persistLocalAndRender();
}

async function deleteMember(id) {
  if (usingSupabase) {
    await runRemoteMutation(() => supabaseClient.from("coffee_members").delete().eq("id", id));
    return;
  }

  state.members = state.members.filter((member) => member.id !== id);
  persistLocalAndRender();
}

async function createEntry(input) {
  const entry = {
    id: crypto.randomUUID(),
    type: input.type,
    memberId: input.memberId || null,
    buyerId: input.buyerId || null,
    amount: input.amount,
    pods: input.pods || null,
    date: input.date,
    note: input.note || "",
    createdAt: new Date().toISOString(),
  };

  if (usingSupabase) {
    await runRemoteMutation(() => supabaseClient.from("coffee_entries").insert(toRemoteEntry(entry)));
    return;
  }

  state.entries.push(entry);
  persistLocalAndRender();
}

async function deleteEntry(id) {
  if (usingSupabase) {
    await runRemoteMutation(() => supabaseClient.from("coffee_entries").delete().eq("id", id));
    return;
  }

  state.entries = state.entries.filter((entry) => entry.id !== id);
  persistLocalAndRender();
}

async function replaceAllData(imported) {
  if (usingSupabase) {
    await runRemoteMutation(async () => {
      const deleteEntries = await supabaseClient.from("coffee_entries").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (deleteEntries.error) return deleteEntries;

      const deleteMembers = await supabaseClient.from("coffee_members").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (deleteMembers.error) return deleteMembers;

      const members = imported.members.map(normalizeImportedMember).map(toRemoteMember);
      const entries = imported.entries.map(normalizeImportedEntry).map(toRemoteEntry);

      if (members.length) {
        const membersInsert = await supabaseClient.from("coffee_members").insert(members);
        if (membersInsert.error) return membersInsert;
      }

      if (entries.length) {
        return supabaseClient.from("coffee_entries").insert(entries);
      }

      return { error: null };
    });
    return;
  }

  state.members = imported.members.map(normalizeImportedMember);
  state.entries = imported.entries.map(normalizeImportedEntry);
  persistLocalAndRender();
}

async function runRemoteMutation(mutation) {
  try {
    const result = await mutation();
    if (result.error) throw result.error;
    await loadRemoteData();
  } catch (error) {
    console.error(error);
    alert("La synchronisation Supabase a échoué. Vérifie la configuration et les règles de sécurité.");
    setSyncStatus("error", "Erreur de synchronisation Supabase");
  }
}

function loadLocalState() {
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

function persistLocalAndRender() {
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

function toRemoteMember(member) {
  return {
    id: member.id,
    name: member.name,
    created_at: member.createdAt,
  };
}

function fromRemoteMember(member) {
  return {
    id: member.id,
    name: member.name,
    createdAt: member.created_at,
  };
}

function toRemoteEntry(entry) {
  return {
    id: entry.id,
    type: entry.type,
    member_id: entry.memberId,
    buyer_id: entry.buyerId,
    amount: entry.amount,
    pods: entry.pods,
    entry_date: entry.date,
    note: entry.note,
    created_at: entry.createdAt,
  };
}

function fromRemoteEntry(entry) {
  return {
    id: entry.id,
    type: entry.type,
    memberId: entry.member_id,
    buyerId: entry.buyer_id,
    amount: Number(entry.amount),
    pods: entry.pods,
    date: entry.entry_date,
    note: entry.note || "",
    createdAt: entry.created_at,
  };
}

function normalizeImportedMember(member) {
  return {
    id: member.id || crypto.randomUUID(),
    name: String(member.name || "").trim(),
    createdAt: member.createdAt || member.created_at || new Date().toISOString(),
  };
}

function normalizeImportedEntry(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    type: entry.type,
    memberId: entry.memberId || entry.member_id || null,
    buyerId: entry.buyerId || entry.buyer_id || null,
    amount: Number(entry.amount),
    pods: entry.pods ? Number(entry.pods) : null,
    date: entry.date || entry.entry_date || today,
    note: entry.note || "",
    createdAt: entry.createdAt || entry.created_at || new Date().toISOString(),
  };
}

function setSyncStatus(mode, text) {
  elements.syncStatus.dataset.mode = mode;
  elements.syncStatus.textContent = text;
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

init();
