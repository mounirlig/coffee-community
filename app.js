const STORAGE_KEY = "coffee-community-data-v5";
const TEAM_STORAGE_KEY = "coffee-community-active-team";
const SUPABASE_CONFIG = window.COFFEE_COMMUNITY_SUPABASE || {};

const state = {
  session: null,
  teams: [],
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
  loginForm: document.querySelector("#loginForm"),
  loginEmail: document.querySelector("#loginEmail"),
  sessionPanel: document.querySelector("#sessionPanel"),
  sessionEmail: document.querySelector("#sessionEmail"),
  signOutButton: document.querySelector("#signOutButton"),
  authMessage: document.querySelector("#authMessage"),
  teamPanel: document.querySelector("#teamPanel"),
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

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await signIn(elements.loginEmail.value.trim());
});

elements.signOutButton.addEventListener("click", async () => {
  if (!usingSupabase) return;
  await supabaseClient.auth.signOut();
});

elements.teamForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = elements.teamName.value.trim();
  if (!name) return;

  await createTeam(name);
  elements.teamName.value = "";
});

elements.joinTeamForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = elements.teamCode.value.trim();
  if (!code) return;

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
  if (usingSupabase && state.session) {
    loadTeamsAndData();
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

  setSyncStatus("remote", "Connexion Supabase");
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error(error);
    setSyncStatus("error", "Erreur session Supabase");
  }

  state.session = data?.session || null;
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    if (!session) {
      state.teams = [];
      state.currentTeamId = "";
      state.members = [];
      state.entries = [];
      localStorage.removeItem(TEAM_STORAGE_KEY);
      unsubscribeFromRemoteChanges();
      render();
      return;
    }
    await loadTeamsAndData();
  });

  await loadTeamsAndData();
}

function createSupabaseClient() {
  const url = String(SUPABASE_CONFIG.url || "").trim();
  const anonKey = String(SUPABASE_CONFIG.anonKey || "").trim();
  if (!url || !anonKey || !window.supabase?.createClient) return null;

  return window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

async function signIn(email) {
  if (!email || !usingSupabase) return;

  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) {
    console.error(error);
    elements.authMessage.textContent = "Impossible d'envoyer le lien de connexion.";
    return;
  }

  elements.authMessage.textContent = "Lien envoyé. Vérifie ta boîte mail.";
}

async function loadTeamsAndData() {
  renderAuth();

  if (!usingSupabase) {
    render();
    return;
  }

  if (!state.session) {
    setSyncStatus("local", "Connecte-toi pour synchroniser");
    render();
    return;
  }

  await loadTeams();
  await loadRemoteData();
  subscribeToRemoteChanges();
}

async function loadTeams() {
  const { data, error } = await supabaseClient
    .from("coffee_teams")
    .select("id, name, invite_code, created_at")
    .order("name", { ascending: true });

  if (error) {
    console.error(error);
    setSyncStatus("error", "Erreur chargement équipes");
    return;
  }

  state.teams = data.map(fromRemoteTeam);
  if (!state.teams.some((team) => team.id === state.currentTeamId)) {
    state.currentTeamId = state.teams[0]?.id || "";
  }

  if (state.currentTeamId) {
    localStorage.setItem(TEAM_STORAGE_KEY, state.currentTeamId);
  } else {
    localStorage.removeItem(TEAM_STORAGE_KEY);
  }
}

async function loadRemoteData() {
  if (!state.session || !state.currentTeamId) {
    state.members = [];
    state.entries = [];
    render();
    return;
  }

  try {
    const [membersResult, entriesResult] = await Promise.all([
      supabaseClient
        .from("coffee_members")
        .select("*")
        .eq("team_id", state.currentTeamId)
        .order("name", { ascending: true }),
      supabaseClient
        .from("coffee_entries")
        .select("*")
        .eq("team_id", state.currentTeamId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (membersResult.error) throw membersResult.error;
    if (entriesResult.error) throw entriesResult.error;

    state.members = membersResult.data.map(fromRemoteMember);
    state.entries = entriesResult.data.map(fromRemoteEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setSyncStatus("remote", `Synchronisé: ${activeTeam()?.name || "équipe"}`);
    render();
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "Erreur de synchronisation Supabase");
    render();
  }
}

function subscribeToRemoteChanges() {
  if (!usingSupabase || !state.session || !state.currentTeamId) return;

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
  if (!state.session) return;

  const teamId = crypto.randomUUID();
  const team = {
    id: teamId,
    name,
    created_by: state.session.user.id,
    created_at: new Date().toISOString(),
  };
  const membership = {
    team_id: teamId,
    user_id: state.session.user.id,
    role: "owner",
  };

  await runRemoteMutation(async () => {
    const teamResult = await supabaseClient.from("coffee_teams").insert(team);
    if (teamResult.error) return teamResult;
    return supabaseClient.from("coffee_team_memberships").insert(membership);
  });

  state.currentTeamId = teamId;
  localStorage.setItem(TEAM_STORAGE_KEY, state.currentTeamId);
  await loadTeamsAndData();
}

async function joinTeam(code) {
  if (!state.session) return;

  try {
    const { data, error } = await supabaseClient.rpc("join_coffee_team", {
      team_invite_code: code,
    });

    if (error) throw error;
    state.currentTeamId = data;
    localStorage.setItem(TEAM_STORAGE_KEY, state.currentTeamId);
    await loadTeamsAndData();
  } catch (error) {
    console.error(error);
    alert("Impossible de rejoindre cette équipe. Vérifie le code d'invitation.");
  }
}

async function createMember(name) {
  const member = {
    id: crypto.randomUUID(),
    teamId: state.currentTeamId || null,
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
    await runRemoteMutation(() => supabaseClient.from("coffee_members").delete().eq("id", id).eq("team_id", state.currentTeamId));
    return;
  }

  state.members = state.members.filter((member) => member.id !== id);
  persistLocalAndRender();
}

async function createEntry(input) {
  const entry = {
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
    await runRemoteMutation(() => supabaseClient.from("coffee_entries").delete().eq("id", id).eq("team_id", state.currentTeamId));
    return;
  }

  state.entries = state.entries.filter((entry) => entry.id !== id);
  persistLocalAndRender();
}

async function replaceAllData(imported) {
  if (usingSupabase) {
    if (!state.currentTeamId) return;

    await runRemoteMutation(async () => {
      const deleteEntries = await supabaseClient.from("coffee_entries").delete().eq("team_id", state.currentTeamId);
      if (deleteEntries.error) return deleteEntries;

      const deleteMembers = await supabaseClient.from("coffee_members").delete().eq("team_id", state.currentTeamId);
      if (deleteMembers.error) return deleteMembers;

      const members = imported.members.map(normalizeImportedMember).map((member) => toRemoteMember({ ...member, teamId: state.currentTeamId }));
      const entries = imported.entries.map(normalizeImportedEntry).map((entry) => toRemoteEntry({ ...entry, teamId: state.currentTeamId }));

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
    alert("La synchronisation Supabase a échoué. Vérifie la session, l'équipe active et les règles de sécurité.");
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
  renderAuth();
  renderTeams();
  renderSummary();
  renderMembers();
  renderSelects();
  renderLedger();
}

function renderAuth() {
  const email = state.session?.user?.email || "";
  elements.loginForm.classList.toggle("is-hidden", Boolean(email));
  elements.sessionPanel.classList.toggle("is-hidden", !email);
  elements.sessionEmail.textContent = email || "Non connecté";
  elements.authMessage.textContent = usingSupabase
    ? email ? "" : "Connexion par lien magique email."
    : "Supabase n'est pas configuré, stockage local actif.";
}

function renderTeams() {
  const signedIn = Boolean(state.session);
  elements.teamSelect.disabled = !signedIn || state.teams.length === 0;
  elements.teamForm.querySelector("button").disabled = !signedIn;
  elements.joinTeamForm.querySelector("button").disabled = !signedIn;
  elements.teamName.disabled = !signedIn;
  elements.teamCode.disabled = !signedIn;

  elements.teamSelect.innerHTML = state.teams
    .map((team) => `<option value="${team.id}" ${team.id === state.currentTeamId ? "selected" : ""}>${escapeHtml(team.name)}</option>`)
    .join("");

  if (!signedIn) {
    elements.teamMessage.textContent = "Connecte-toi pour choisir ou créer une équipe.";
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
    elements.memberList.append(emptyState("Choisis une équipe.", "Connecte-toi puis crée ou sélectionne une équipe pour gérer ses membres."));
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

function toRemoteTeam(team) {
  return {
    id: team.id,
    name: team.name,
    invite_code: team.inviteCode,
    created_by: team.createdBy,
    created_at: team.createdAt,
  };
}

function fromRemoteTeam(team) {
  return {
    id: team.id,
    name: team.name,
    inviteCode: team.invite_code,
    createdAt: team.created_at,
  };
}

function toRemoteMember(member) {
  return {
    id: member.id,
    team_id: member.teamId,
    name: member.name,
    created_at: member.createdAt,
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

function toRemoteEntry(entry) {
  return {
    id: entry.id,
    team_id: entry.teamId,
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
  return !usingSupabase || Boolean(state.session && state.currentTeamId);
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
