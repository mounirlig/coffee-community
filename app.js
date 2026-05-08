const STORAGE_KEY = "coffee-community-data-v6";
const TEAM_STORAGE_KEY = "coffee-community-active-team";
const TEAMS_STORAGE_KEY = "coffee-community-known-teams";
const USERNAME_STORAGE_KEY = "coffee-community-username";
const SUPABASE_CONFIG = window.COFFEE_COMMUNITY_SUPABASE || {};

const state = {
  username: localStorage.getItem(USERNAME_STORAGE_KEY) || "",
  teams: loadKnownTeams(),
  currentTeamId: localStorage.getItem(TEAM_STORAGE_KEY) || "",
  members: [],
  entries: [],
};

let activeFilter = "all";
let supabaseClient = null;
let usingSupabase = false;
let realtimeChannel = null;

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
  userForm: document.querySelector("#userForm"),
  usernameInput: document.querySelector("#usernameInput"),
  userPanel: document.querySelector("#userPanel"),
  usernameDisplay: document.querySelector("#usernameDisplay"),
  changeUserButton: document.querySelector("#changeUserButton"),
  authMessage: document.querySelector("#authMessage"),
  teamForm: document.querySelector("#teamForm"),
  teamName: document.querySelector("#teamName"),
  joinTeamForm: document.querySelector("#joinTeamForm"),
  teamCode: document.querySelector("#teamCode"),
  teamSelect: document.querySelector("#teamSelect"),
  teamMessage: document.querySelector("#teamMessage"),
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

elements.userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = elements.usernameInput.value.trim();
  if (!username) return;

  state.username = username;
  localStorage.setItem(USERNAME_STORAGE_KEY, username);
  render();
});

elements.changeUserButton.addEventListener("click", () => {
  state.username = "";
  localStorage.removeItem(USERNAME_STORAGE_KEY);
  render();
});

elements.teamForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = elements.teamName.value.trim();
  if (!name || !state.username) return;

  await createTeam(name);
  elements.teamName.value = "";
});

elements.joinTeamForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = elements.teamCode.value.trim();
  if (!code || !state.username) return;

  await joinTeam(code);
  elements.teamCode.value = "";
});

elements.teamSelect.addEventListener("change", async () => {
  state.currentTeamId = elements.teamSelect.value;
  localStorage.setItem(TEAM_STORAGE_KEY, state.currentTeamId);
  await loadRemoteData();
  subscribeToRemoteChanges();
});

elements.memberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = elements.memberName.value.trim();
  if (!name || !canUseWorkspace()) return;

  await createMember(name);
  elements.memberName.value = "";
});

elements.memberList.addEventListener("click", async (event) => {
  const action = event.target.dataset.action;
  const id = event.target.dataset.id;
  if (!action || !id || !canUseWorkspace()) return;

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
  if (action !== "delete-entry" || !id || !canUseWorkspace()) return;
  if (!confirm("Supprimer cette ligne de l'historique ?")) return;

  await deleteEntry(id);
});

elements.contributionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canUseWorkspace()) return;

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
  if (!canUseWorkspace()) return;

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
  const payload = {
    team: activeTeam()?.name || "Equipe locale",
    members: state.members,
    entries: state.entries,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
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
  if (usingSupabase && state.currentTeamId) {
    loadRemoteData();
  }
});

async function init() {
  supabaseClient = createSupabaseClient();
  usingSupabase = Boolean(supabaseClient);

  if (!usingSupabase) {
    Object.assign(state, loadLocalState());
    setSyncStatus("local", "Stockage local");
    render();
    return;
  }

  setSyncStatus("remote", "Supabase connecté");
  if (state.currentTeamId && !state.teams.some((team) => team.id === state.currentTeamId)) {
    await restoreActiveTeam();
  }
  await loadRemoteData();
  subscribeToRemoteChanges();
  render();
}

function createSupabaseClient() {
  const url = String(SUPABASE_CONFIG.url || "").trim();
  const anonKey = String(SUPABASE_CONFIG.anonKey || "").trim();
  if (!url || !anonKey || !window.supabase?.createClient) return null;

  return window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function restoreActiveTeam() {
  const { data, error } = await supabaseClient.rpc("get_coffee_team_public", {
    p_team_id: state.currentTeamId,
  });

  if (error || !data?.length) {
    state.currentTeamId = "";
    localStorage.removeItem(TEAM_STORAGE_KEY);
    return;
  }

  rememberTeam(fromRemoteTeam(data[0]));
}

async function loadRemoteData() {
  if (!usingSupabase || !state.currentTeamId) {
    state.members = [];
    state.entries = [];
    render();
    return;
  }

  try {
    const [membersResult, entriesResult] = await Promise.all([
      supabaseClient.rpc("list_coffee_members_public", { p_team_id: state.currentTeamId }),
      supabaseClient.rpc("list_coffee_entries_public", { p_team_id: state.currentTeamId }),
    ]);

    if (membersResult.error) throw membersResult.error;
    if (entriesResult.error) throw entriesResult.error;

    state.members = membersResult.data.map(fromRemoteMember);
    state.entries = entriesResult.data.map(fromRemoteEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ members: state.members, entries: state.entries }));
    setSyncStatus("remote", `Synchronisé: ${activeTeam()?.name || "équipe"}`);
    render();
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "Erreur de synchronisation Supabase");
    render();
  }
}

function subscribeToRemoteChanges() {
  if (!usingSupabase || !state.currentTeamId) return;

  unsubscribeFromRemoteChanges();
  realtimeChannel = supabaseClient
    .channel(`coffee-community-${state.currentTeamId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "coffee_members", filter: `team_id=eq.${state.currentTeamId}` }, loadRemoteData)
    .on("postgres_changes", { event: "*", schema: "public", table: "coffee_entries", filter: `team_id=eq.${state.currentTeamId}` }, loadRemoteData)
    .subscribe();
}

function unsubscribeFromRemoteChanges() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

async function createTeam(name) {
  if (!usingSupabase) {
    const team = {
      id: crypto.randomUUID(),
      name,
      inviteCode: "local",
      createdAt: new Date().toISOString(),
    };
    rememberTeam(team);
    state.currentTeamId = team.id;
    localStorage.setItem(TEAM_STORAGE_KEY, team.id);
    render();
    return;
  }

  await runRemoteMutation(async () => {
    const result = await supabaseClient.rpc("create_coffee_team_public", {
      p_team_name: name,
      p_user_name: state.username,
    });
    if (result.error) return result;

    const team = fromRemoteTeam(result.data[0]);
    rememberTeam(team);
    state.currentTeamId = team.id;
    localStorage.setItem(TEAM_STORAGE_KEY, team.id);
    return { error: null };
  });
}

async function joinTeam(code) {
  if (!usingSupabase) return;

  await runRemoteMutation(async () => {
    const result = await supabaseClient.rpc("join_coffee_team_public", {
      p_invite_code: code,
      p_user_name: state.username,
    });
    if (result.error) return result;

    const team = fromRemoteTeam(result.data[0]);
    rememberTeam(team);
    state.currentTeamId = team.id;
    localStorage.setItem(TEAM_STORAGE_KEY, team.id);
    return { error: null };
  });
}

async function createMember(name) {
  if (usingSupabase) {
    await runRemoteMutation(() => supabaseClient.rpc("create_coffee_member_public", {
      p_team_id: state.currentTeamId,
      p_name: name,
    }));
    return;
  }

  state.members.push({
    id: crypto.randomUUID(),
    teamId: state.currentTeamId || null,
    name,
    createdAt: new Date().toISOString(),
  });
  persistLocalAndRender();
}

async function deleteMember(id) {
  if (usingSupabase) {
    await runRemoteMutation(() => supabaseClient.rpc("delete_coffee_member_public", {
      p_team_id: state.currentTeamId,
      p_member_id: id,
    }));
    return;
  }

  state.members = state.members.filter((member) => member.id !== id);
  persistLocalAndRender();
}

async function createEntry(input) {
  if (usingSupabase) {
    await runRemoteMutation(() => supabaseClient.rpc("create_coffee_entry_public", {
      p_team_id: state.currentTeamId,
      p_type: input.type,
      p_member_id: input.memberId || null,
      p_buyer_id: input.buyerId || null,
      p_amount: input.amount,
      p_pods: input.pods || null,
      p_entry_date: input.date,
      p_note: input.note || "",
    }));
    return;
  }

  state.entries.push({
    id: crypto.randomUUID(),
    teamId: state.currentTeamId || null,
    type: input.type,
    memberId: input.memberId || null,
    buyerId: input.buyerId || null,
    amount: input.amount,
    pods: input.pods || null,
    date: input.date,
    note: input.note || "",
    createdAt: new Date().toISOString(),
  });
  persistLocalAndRender();
}

async function deleteEntry(id) {
  if (usingSupabase) {
    await runRemoteMutation(() => supabaseClient.rpc("delete_coffee_entry_public", {
      p_team_id: state.currentTeamId,
      p_entry_id: id,
    }));
    return;
  }

  state.entries = state.entries.filter((entry) => entry.id !== id);
  persistLocalAndRender();
}

async function replaceAllData(imported) {
  if (usingSupabase) {
    if (!state.currentTeamId) return;

    await runRemoteMutation(async () => {
      const clearResult = await supabaseClient.rpc("clear_coffee_team_data_public", {
        p_team_id: state.currentTeamId,
      });
      if (clearResult.error) return clearResult;

      const memberIdMap = new Map();
      for (const member of imported.members.map(normalizeImportedMember)) {
        const result = await supabaseClient.rpc("create_coffee_member_public", {
          p_team_id: state.currentTeamId,
          p_name: member.name,
        });
        if (result.error) return result;
        memberIdMap.set(member.id, result.data);
      }

      for (const entry of imported.entries.map(normalizeImportedEntry)) {
        const result = await supabaseClient.rpc("create_coffee_entry_public", {
          p_team_id: state.currentTeamId,
          p_type: entry.type,
          p_member_id: entry.memberId ? memberIdMap.get(entry.memberId) || null : null,
          p_buyer_id: entry.buyerId ? memberIdMap.get(entry.buyerId) || null : null,
          p_amount: entry.amount,
          p_pods: entry.pods || null,
          p_entry_date: entry.date,
          p_note: entry.note,
        });
        if (result.error) return result;
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
    alert(`La synchronisation Supabase a échoué: ${error.message}`);
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

function loadKnownTeams() {
  try {
    const teams = JSON.parse(localStorage.getItem(TEAMS_STORAGE_KEY));
    return Array.isArray(teams) ? teams : [];
  } catch (error) {
    localStorage.removeItem(TEAMS_STORAGE_KEY);
    return [];
  }
}

function rememberTeam(team) {
  state.teams = [team, ...state.teams.filter((item) => item.id !== team.id)]
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(state.teams));
}

function persistLocalAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ members: state.members, entries: state.entries }));
  render();
}

function render() {
  renderUser();
  renderTeams();
  renderSummary();
  renderMembers();
  renderSelects();
  renderLedger();
}

function renderUser() {
  const hasUsername = Boolean(state.username);
  elements.userForm.classList.toggle("is-hidden", hasUsername);
  elements.userPanel.classList.toggle("is-hidden", !hasUsername);
  elements.usernameDisplay.textContent = state.username || "Non configuré";
  elements.authMessage.textContent = hasUsername
    ? "Ce nom est stocké uniquement dans ce navigateur."
    : "Aucun email ni mot de passe. Choisis juste un nom local.";
}

function renderTeams() {
  const hasUsername = Boolean(state.username);
  elements.teamSelect.disabled = !hasUsername || state.teams.length === 0;
  elements.teamForm.querySelector("button").disabled = !hasUsername;
  elements.joinTeamForm.querySelector("button").disabled = !hasUsername;
  elements.teamName.disabled = !hasUsername;
  elements.teamCode.disabled = !hasUsername;

  elements.teamSelect.innerHTML = state.teams
    .map((team) => `<option value="${team.id}" ${team.id === state.currentTeamId ? "selected" : ""}>${escapeHtml(team.name)}</option>`)
    .join("");

  if (!hasUsername) {
    elements.teamMessage.textContent = "Choisis un nom d'utilisateur pour créer ou rejoindre une équipe.";
  } else if (!state.teams.length) {
    elements.teamMessage.textContent = "Crée une équipe ou rejoins-en une avec un code.";
  } else {
    const team = activeTeam();
    elements.teamMessage.textContent = `Données isolées pour "${team?.name || ""}". Code équipe: ${team?.inviteCode || ""}`;
  }
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

  if (!canUseWorkspace()) {
    elements.memberList.append(emptyState("Choisis une équipe.", "Définis ton nom puis crée ou rejoins une équipe pour gérer ses membres."));
    return;
  }

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
  const disabled = !canUseWorkspace() || state.members.length === 0;
  elements.memberForm.querySelector("button").disabled = !canUseWorkspace();
  elements.memberName.disabled = !canUseWorkspace();
  elements.contributionForm.querySelector("button").disabled = disabled;
  elements.purchaseForm.querySelector("button").disabled = disabled;
}

function renderLedger() {
  elements.ledger.innerHTML = "";

  if (!canUseWorkspace()) {
    elements.ledger.append(emptyState("Aucune équipe active.", "Les mouvements apparaîtront ici après sélection d'une équipe."));
    return;
  }

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

function fromRemoteTeam(team) {
  return {
    id: team.id,
    name: team.name,
    inviteCode: team.invite_code,
    createdAt: team.created_at,
  };
}

function fromRemoteMember(member) {
  return {
    id: member.id,
    teamId: member.team_id,
    name: member.name,
    createdAt: member.created_at,
  };
}

function fromRemoteEntry(entry) {
  return {
    id: entry.id,
    teamId: entry.team_id,
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
    teamId: state.currentTeamId || member.teamId || member.team_id || null,
    name: String(member.name || "").trim(),
    createdAt: member.createdAt || member.created_at || new Date().toISOString(),
  };
}

function normalizeImportedEntry(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    teamId: state.currentTeamId || entry.teamId || entry.team_id || null,
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

function canUseWorkspace() {
  return Boolean(state.username && state.currentTeamId);
}

function activeTeam() {
  return state.teams.find((team) => team.id === state.currentTeamId) || null;
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

function emptyState(title = "Aucune donnée pour l'instant.", message = "Ajoute quelques membres puis enregistre les contributions et les achats de café.") {
  const node = elements.emptyStateTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("strong").textContent = title;
  node.querySelector("span").textContent = message;
  return node;
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
