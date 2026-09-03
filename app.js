"use strict";
const KEY = "fallera-elo-config",
  AUTH_KEY = "fallera-elo-authorized",
  THEME_KEY = "fallera-elo-theme",
  API = "https://api.github.com/repos/";
const DEFAULT_CONFIG = {
  owner: "IvanRemolina",
  repo: "FalleraCalabera",
  branch: "main",
};
const BUILT_IN_TOKEN = "";
const APP_PASSWORD = "fallera";
const SYNC_INTERVAL = 5000;

// Estado en memoria de la aplicación y referencias a la sincronización activa.
const blank = () => ({ players: [], games: [], decks: [] });
let db = blank(),
  editingId = null,
  syncInProgress = false,
  syncTimer = null;
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

// Combina la configuración fija del repositorio con la configuración del navegador.
const config = () => ({
  ...DEFAULT_CONFIG,
  ...JSON.parse(localStorage.getItem(KEY) || "null"),
  token:
    BUILT_IN_TOKEN ||
    JSON.parse(localStorage.getItem(KEY) || "null")?.token ||
    "",
});

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark", isDark);
  const button = $("#themeToggle");
  button.textContent = isDark ? "☀ Claro" : "☾ Oscuro";
  button.title = isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  button.setAttribute("aria-pressed", String(isDark));
}

applyTheme(localStorage.getItem(THEME_KEY) || "light");

function ensureAccess() {
  // Esta contraseña solo evita ediciones accidentales; no sustituye al token.
  if (localStorage.getItem(AUTH_KEY) === "yes") return true;
  const password = prompt("Contraseña de la partida");
  if (password !== APP_PASSWORD) {
    toast("Contraseña incorrecta", true);
    return false;
  }
  localStorage.setItem(AUTH_KEY, "yes");
  return true;
}
function ensureCanEdit() {
  if (!config().token) {
    toast("Modo solo lectura: falta configurar el token", true);
    return false;
  }
  return ensureAccess();
}
function show(id, on = true) {
  $(id).classList.toggle("hidden", !on);
  $(id).classList.toggle("flex", on);
}
function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className =
    "fixed bottom-5 right-5 rounded-lg px-4 py-3 text-sm font-bold text-white " +
    (error ? "bg-[#b84339]" : "bg-[#24211e]");
  setTimeout(() => el.classList.add("hidden"), 2800);
}
function notify(message, error = false) {
  const el = $("#notice");
  el.textContent = message;
  el.className =
    "mb-5 rounded-lg border px-4 py-3 text-sm " +
    (error
      ? "border-red-300 bg-red-50 text-red-800"
      : "border-green-300 bg-green-50 text-green-800");
}
function dateText(iso) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function deckLabel(deck) {
  if (!deck) return "Baraja no especificada";
  return deck.version ? `${deck.name} · ${deck.version}` : deck.name;
}

// Fórmula multinomial equivalente a la hoja de cálculo: amplitud 400 y K=25.
function expected(elo, participantElos) {
  const weights = participantElos.map((rating) => 10 ** (rating / 400));
  return 10 ** (elo / 400) / weights.reduce((sum, weight) => sum + weight, 0);
}

// La hoja de cálculo aplica un mínimo de un punto a cada cambio redondeado.
function applyEloChange(elo, change) {
  const roundedChange = Math.round(change);
  const minimumChange = Math.max(1, Math.abs(roundedChange));
  // El mínimo de un punto puede hacer que el total se desvíe ligeramente.
  return elo + Math.sign(change) * minimumChange;
}

// El historial es la fuente de verdad: primero se reinician las estadísticas y
// después se reproducen las partidas en orden cronológico.
function recalculate() {
  db.players.forEach((p) => {
    p.elo = p.initialElo;
    p.wins = 0;
    p.losses = 0;
    p.games = 0;
  });
  for (const game of [...db.games].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  )) {
    const ratings = new Map(db.players.map((p) => [p.id, p.elo]));
    const participantElos = game.players.map((id) => ratings.get(id) ?? 1000);
    const changes = [];
    game.players.forEach((id, place) => {
      const p = db.players.find((x) => x.id === id);
      if (!p) return;
      const probability = expected(ratings.get(id) ?? p.elo, participantElos);
      const result = place === 0 ? 1 : 0;
      changes.push([p, 25 * (result - probability), place]);
    });
    changes.forEach(([p, change, place]) => {
      p.elo = applyEloChange(ratings.get(p.id) ?? p.elo, change);
      p.games++;
      if (place === 0) p.wins++;
      else p.losses++;
    });
  }
}

function buildRankLabels(players) {
  const labels = Array(players.length).fill("");

  for (let i = 0; i < players.length; i++) {
    if (labels[i]) continue;

    let last = i;
    while (last + 1 < players.length && players[last + 1].elo === players[i].elo) {
      last += 1;
    }

    const label =
      i === last ? `${i + 1}` : `${i + 1}-${last + 1}`;

    for (let j = i; j <= last; j += 1) {
      labels[j] = label;
    }
  }

  return labels;
}

function sortPlayers(players, mode = "alphabetic") {
  const list = [...players];

  switch (mode) {
    case "elo":
      return list.sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name));
    case "games":
      return list.sort((a, b) => b.games - a.games || b.elo - a.elo || a.name.localeCompare(b.name));
    case "wins":
      return list.sort((a, b) => b.wins - a.wins || b.elo - a.elo || a.name.localeCompare(b.name));
    case "losses":
      return list.sort((a, b) => b.losses - a.losses || b.elo - a.elo || a.name.localeCompare(b.name));
    case "alphabetic":
    default:
      return list.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function render() {
  recalculate();
  const ranked = [...db.players].sort(
    (a, b) => b.elo - a.elo || a.name.localeCompare(b.name),
  );
  const rankLabels = buildRankLabels(ranked);
  const baselineElo = ranked.length * 100;
  const totalElo = ranked.reduce((sum, player) => sum + player.elo, 0);
  const deviation = totalElo - baselineElo;
  const deviationPercent = baselineElo ? (deviation / baselineElo) * 100 : 0;
  const signedDeviation = deviation > 0 ? "+" : "";
  const signedDeviationPercent = deviationPercent > 0 ? "+" : "";
  $("#eloDeviation").textContent =
    `Desviación: ${signedDeviation}${deviation} / ${signedDeviationPercent}${deviationPercent.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  $("#emptyRanking").classList.toggle("hidden", ranked.length > 0);
  $("#rankingBody").innerHTML = ranked
    .map(
      (p, i) =>
        `<tr class="border-b border-[#eadfce] last:border-0"><td class="px-5 py-4"><span class="rank mr-2 text-xl font-bold text-coral">${rankLabels[i]}</span><b>${esc(p.name)}</b></td><td class="font-bold">${p.elo}</td><td>${p.wins}</td><td>${p.losses}</td><td>${p.games ? Math.round((p.wins / p.games) * 100) : 0}%</td><td>${p.games}</td><td>${p.lastGame ? dateText(p.lastGame) : "—"}</td></tr>`,
    )
    .join("");
  $("#gameCount").textContent = db.games.length ? `(${db.games.length})` : "";
  $("#emptyHistory").classList.toggle("hidden", db.games.length > 0);
  $("#historyBody").innerHTML = [...db.games]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(
      (g) =>
        `<article class="panel flex items-center justify-between gap-4 rounded-xl p-4"><div><p class="text-xs font-bold uppercase tracking-wider text-[#766b5f]">${dateText(g.date)} · ${deckLabel(db.decks.find((deck) => deck.id === g.deckId))}</p><p class="mt-1 font-bold">${g.players
          .map((id, i) => {
            const p = db.players.find((x) => x.id === id);
            return `<span class="text-coral">${i + 1}.</span> ${esc(p?.name || "Jugador eliminado")}`;
          })
          .join(
            " &nbsp; ",
          )}</p></div><button class="deleteGame rounded-lg border border-[#ddcdb8] px-3 py-2 text-sm font-bold text-[#b84339] hover:bg-red-50" data-id="${g.id}">Eliminar</button></article>`,
    )
    .join("");
  const playersSortMode = $("#playerSortSelect")?.value || "alphabetic";
  const orderedPlayers = sortPlayers(db.players, playersSortMode);
  $("#playersBody").innerHTML = orderedPlayers
    .map(
      (p) =>
        `<article class="panel flex items-center justify-between rounded-xl p-4"><div><b>${esc(p.name)}</b><p class="text-sm text-[#766b5f]">Elo ${p.elo} · Inicial ${p.initialElo} · ${p.games} partidas</p></div><div class="flex gap-3"><button class="editPlayer text-sm font-bold text-coral" data-id="${p.id}">Editar</button><button class="deletePlayer text-sm font-bold text-[#b84339]" data-id="${p.id}">Eliminar</button></div></article>`,
    )
    .join("");
  $("#decksBody").innerHTML = db.decks
    .map(
      (deck) =>
        `<article class="panel flex items-center justify-between rounded-xl p-4"><div><b>${esc(deckLabel(deck))}</b><p class="text-sm text-[#766b5f]">${db.games.filter((game) => game.deckId === deck.id).length} partidas</p></div><button class="deleteDeck text-sm font-bold text-[#b84339]" data-id="${deck.id}">Eliminar</button></article>`,
    )
    .join("");
}

function deckInputs() {
  $("#deckSelect").innerHTML = db.decks.length
    ? db.decks
        .map(
          (deck) =>
            `<option value="${deck.id}">${esc(deckLabel(deck))}</option>`,
        )
        .join("")
    : '<option value="">Sin barajas: añade una primero</option>';
  $("#deckSelect").disabled = !db.decks.length;
}

function participantInputs() {
  const count = +$("#playerCount").value;
  $("#participantFields").innerHTML = Array.from(
    { length: count },
    (_, i) => {
      const label = i === 0 ? "Ganador" : `Perdedor ${i}`;
      const options = [
        '<option value="">Selecciona jugador</option>',
        ...db.players.map(
          (p) => `<option value="${p.id}">${esc(p.name)} (Elo ${p.elo})</option>`,
        ),
      ].join("");

      return `<label class="block text-sm font-bold">${label}<select class="participant mt-1 w-full rounded-lg border border-[#cbb99f] bg-white p-3">${options}</select></label>`;
    },
  ).join("");
}

// Todas las lecturas y escrituras remotas pasan por la API de contenidos de GitHub.
async function github(method = "GET", path = "", body) {
  const c = config();
  if (!c?.owner || !c.repo || (method !== "GET" && !c.token))
    throw Error(
      method === "GET"
        ? "Repositorio no configurado."
        : "Configura el token del propietario.",
    );
  const opts = {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  };
  if (c.token) opts.headers.Authorization = `Bearer ${c.token}`;
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(
    API +
      c.owner +
      "/" +
      c.repo +
      "/contents/database.json?ref=" +
      encodeURIComponent(c.branch || "main"),
    opts,
  );
  if (!r.ok) throw Error(`GitHub ${r.status}: ${await r.text()}`);
  return r.json();
}

// Guarda el estado local en GitHub cuando hay token; si no, solo conserva la copia local.
async function persist(message) {
  const c = config();
  if (!c?.token) {
    toast("Guardado en modo local");
    return;
  }
  $("#syncStatus").textContent = "Sincronizando…";
  try {
    let remote;
    try {
      remote = await github();
    } catch (e) {
      if (!String(e).includes("404")) throw e;
    }
    const content = btoa(
      unescape(encodeURIComponent(JSON.stringify(db, null, 2))),
    );
    const payload = { message, content, branch: c.branch || "main" };
    if (remote?.sha) payload.sha = remote.sha;
    // GitHub versiona cada PUT como un commit; Pages puede desplegarlo después.
    await github("PUT", "database.json", payload);
    $("#syncStatus").textContent = "Sincronizado con GitHub";
    toast("Cambios guardados en GitHub");
  } catch (e) {
    $("#syncStatus").textContent = "Error de sincronización";
    toast(e.message, true);
  }
}

// Los espectadores consultan periódicamente el archivo compartido para ver cambios nuevos.
async function loadRemote(silent = false) {
  if (syncInProgress || (document.hidden && !silent)) return;
  syncInProgress = true;
  try {
    const remote = await github();
    db = JSON.parse(
      decodeURIComponent(escape(atob(remote.content.replace(/\n/g, "")))),
    );
    db.players ??= [];
    db.games ??= [];
    db.decks ??= [];
    render();
    $("#syncStatus").textContent =
      "Sincronizado · " +
      new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
    if (!silent) toast("Datos cargados");
  } catch (e) {
    if (String(e).includes("404")) {
      db = blank();
      render();
      if (!silent) toast("Se creará database.json al guardar");
    } else {
      if (!silent) toast(e.message, true);
      $("#syncStatus").textContent = "Error de sincronización";
    }
  } finally {
    syncInProgress = false;
  }
}

function startAutoSync() {
  if (syncTimer || !config().token) return;
  syncTimer = setInterval(() => loadRemote(true), SYNC_INTERVAL);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadRemote(true);
  });
}

// Controles principales de configuración, pestañas y creación de partidas.
$("#settingsBtn").onclick = () => {
  if (!ensureAccess()) return;
  const c = config();
  ["owner", "repo", "branch", "token"].forEach(
    (k) => ($("#gh" + k[0].toUpperCase() + k.slice(1)).value = c[k] || ""),
  );
  show("#settingsModal");
};

$("#themeToggle").onclick = () => {
  const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
};

$("#saveSettingsBtn").onclick = () => {
  if (!ensureAccess()) return;
  localStorage.setItem(
    KEY,
    JSON.stringify({
      owner: DEFAULT_CONFIG.owner,
      repo: DEFAULT_CONFIG.repo,
      branch: DEFAULT_CONFIG.branch,
      token: $("#ghToken").value.trim(),
    }),
  );
  show("#settingsModal", false);
  startAutoSync();
  loadRemote();
};

$("#localModeBtn").onclick = () => {
  localStorage.removeItem(KEY);
  show("#settingsModal", false);
  db = JSON.parse(localStorage.getItem("fallera-local") || "null") || blank();
  db.players ??= [];
  db.games ??= [];
  db.decks ??= [];
  render();
  toast("Modo local activado");
};

$("#refreshBtn").onclick = () => loadRemote();
$("#newGameBtn").onclick = () => {
  if (!ensureCanEdit()) return;
  if (db.players.length < 2)
    return toast("Necesitas al menos 2 jugadores", true);
  $("#playerCount").value = 2;
  deckInputs();
  participantInputs();
  show("#gameModal");
};
$("#playerCount").onchange = participantInputs;
$("#playerSortSelect").onchange = render;
$("#saveGameBtn").onclick = async () => {
  if (!ensureCanEdit()) return;
  const ids = [...document.querySelectorAll(".participant")].map((x) => x.value.trim());
  if (ids.some((id) => !id))
    return toast("Selecciona un jugador para cada posición", true);
  if (new Set(ids).size !== ids.length)
    return toast("No repitas jugadores", true);
  const deckId = $("#deckSelect").value;
  if (!deckId) return toast("Selecciona o añade una baraja", true);
  db.games.push({
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    players: ids,
    deckId,
  });
  // Solo los participantes deben mostrar esta partida como la última jugada.
  ids.forEach((id) => {
    const player = db.players.find((p) => p.id === id);
    if (player) player.lastGame = db.games.at(-1).date;
  });
  localStorage.setItem("fallera-local", JSON.stringify(db));
  show("#gameModal", false);
  render();
  await persist("Registrar partida");
};
function openDeckModal() {
  if (!ensureCanEdit()) return;
  $("#deckName").value = "";
  $("#deckVersion").value = "";
  show("#deckModal");
}
$("#addDeckBtn").onclick = openDeckModal;
$("#manageDeckBtn").onclick = openDeckModal;
$("#saveDeckBtn").onclick = async () => {
  if (!ensureCanEdit()) return;
  const name = $("#deckName").value.trim();
  const version = $("#deckVersion").value.trim();
  if (!name) return toast("Escribe un nombre para la baraja", true);
  db.decks.push({ id: crypto.randomUUID(), name, version });
  localStorage.setItem("fallera-local", JSON.stringify(db));
  show("#deckModal", false);
  render();
  await persist("Añadir baraja");
};
$("#addPlayerBtn").onclick = () => {
  if (!ensureCanEdit()) return;
  editingId = null;
  $("#playerModalTitle").textContent = "Añadir jugador";
  $("#savePlayerBtn").textContent = "Guardar";
  $("#playerName").value = "";
  $("#playerElo").value = 100;
  show("#playerModal");
};
$("#savePlayerBtn").onclick = async () => {
  if (!ensureCanEdit()) return;
  const name = $("#playerName").value.trim(),
    elo = Number($("#playerElo").value);
  if (!name || !Number.isFinite(elo) || elo < 0 || elo > 4000)
    return toast("Completa los datos correctamente", true);
  if (editingId) {
    const player = db.players.find((p) => p.id === editingId);
    player.name = name;
    player.initialElo = elo;
  } else
    db.players.push({
      id: crypto.randomUUID(),
      name,
      initialElo: elo,
      elo,
      wins: 0,
      losses: 0,
      games: 0,
    });
  localStorage.setItem("fallera-local", JSON.stringify(db));
  show("#playerModal", false);
  render();
  await persist(editingId ? "Modificar jugador" : "Añadir jugador");
};

// Un único listener gestiona los botones que se crean dinámicamente al renderizar.
document.addEventListener("click", async (e) => {
  const close = e.target.closest("[data-close]");
  if (close) show("#" + close.dataset.close, false);
  const tab = e.target.closest(".tab");
  if (tab) {
    document
      .querySelectorAll(".tab")
      .forEach((x) => x.classList.remove("active"));
    tab.classList.add("active");
    ["ranking", "history", "players", "decks"].forEach((v) =>
      $("#" + v + "View").classList.toggle("hidden", v !== tab.dataset.view),
    );
  }
  const ep = e.target.closest(".editPlayer");
  if (ep && ensureCanEdit()) {
    const player = db.players.find((p) => p.id === ep.dataset.id);
    if (player) {
      editingId = player.id;
      $("#playerModalTitle").textContent = "Editar jugador";
      $("#savePlayerBtn").textContent = "Guardar cambios";
      $("#playerName").value = player.name;
      $("#playerElo").value = player.initialElo;
      show("#playerModal");
    }
  }
  const dg = e.target.closest(".deleteGame");
  if (
    dg &&
    ensureCanEdit() &&
    confirm("¿Eliminar esta partida y recalcular la clasificación?")
  ) {
    db.games = db.games.filter((g) => g.id !== dg.dataset.id);
    localStorage.setItem("fallera-local", JSON.stringify(db));
    render();
    await persist("Eliminar partida");
  }
  const dp = e.target.closest(".deletePlayer");
  if (
    dp &&
    ensureCanEdit() &&
    confirm("¿Eliminar el jugador y sus partidas?")
  ) {
    db.players = db.players.filter((p) => p.id !== dp.dataset.id);
    db.games = db.games.filter((g) => !g.players.includes(dp.dataset.id));
    localStorage.setItem("fallera-local", JSON.stringify(db));
    render();
    await persist("Eliminar jugador");
  }
  const dd = e.target.closest(".deleteDeck");
  if (dd && ensureCanEdit()) {
    const isUsed = db.games.some((game) => game.deckId === dd.dataset.id);
    if (isUsed) return toast("No puedes eliminar una baraja ya usada", true);
    if (!confirm("¿Eliminar esta baraja?")) return;
    db.decks = db.decks.filter((deck) => deck.id !== dd.dataset.id);
    localStorage.setItem("fallera-local", JSON.stringify(db));
    render();
    await persist("Eliminar baraja");
  }
});
loadRemote();
if (config().token) startAutoSync();
