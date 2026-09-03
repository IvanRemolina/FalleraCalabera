"use strict";
const KEY = "fallera-elo-config",
  THEME_KEY = "fallera-elo-theme",
  API = "https://api.github.com/repos/";
const DEFAULT_CONFIG = {
  owner: "IvanRemolina",
  repo: "FalleraCalabera",
  branch: "main",
};
const BUILT_IN_TOKEN = "";
const SYNC_INTERVAL = 5000;

// Estado en memoria de la aplicación y referencias a la sincronización activa.
const blank = () => ({ players: [], games: [], decks: [] });
let db = blank(),
  editingId = null,
  editingDeckId = null,
  editingGameId = null,
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

function ensureCanEdit() {
  if (!config().token) {
    toast("Modo solo lectura: falta configurar el token", true);
    return false;
  }
  return true;
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

function dateInputValue(iso) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function deckLabel(deck) {
  if (!deck) return "Baraja no especificada";
  return deck.name;
}

function combinationLabel(deck, combinationId) {
  const editions = Array.isArray(combinationId) ? combinationId.join(", ") : combinationId;
  return editions ? `${deckLabel(deck)} · Ediciones ${editions}` : deckLabel(deck);
}

function normalizeDeck(deck) {
  return {
    ...deck,
    maxEdition: Math.max(1, Number(deck.maxEdition) || deck.units?.length || 1),
  };
}

function normalizeDecks() {
  db.decks = db.decks.map(normalizeDeck);
}

function normalizePlayers() {
  db.players.forEach((player) => {
    player.startingElo = Number.isFinite(player.startingElo)
      ? player.startingElo
      : Number.isFinite(player.elo)
        ? player.elo
        : Number.isFinite(player.initialElo)
          ? player.initialElo
        : 100;
    player.initialElo = 100;
  });
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
    p.elo = p.startingElo ?? 100;
    p.wins = 0;
    p.losses = 0;
    p.games = 0;
    p.lastGame = undefined;
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
      p.lastGame = game.date;
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

function evolutionSnapshots() {
  const players = new Map(
    db.players.map((player) => [player.id, { ...player, elo: player.startingElo ?? 100 }]),
  );
  const snapshots = [
    { date: null, ratings: new Map([...players].map(([id, player]) => [id, player.elo])) },
  ];

  for (const game of [...db.games].sort((a, b) => new Date(a.date) - new Date(b.date))) {
    const ratings = new Map([...players].map(([id, player]) => [id, player.elo]));
    const participantElos = game.players.map((id) => ratings.get(id) ?? 1000);
    const changes = [];
    game.players.forEach((id, place) => {
      const player = players.get(id);
      if (!player) return;
      const probability = expected(ratings.get(id) ?? player.elo, participantElos);
      changes.push([player, 25 * ((place === 0 ? 1 : 0) - probability)]);
    });
    changes.forEach(([player, change]) => {
      player.elo = applyEloChange(ratings.get(player.id) ?? player.elo, change);
    });
    snapshots.push({
      date: game.date,
      ratings: new Map([...players].map(([id, player]) => [id, player.elo])),
    });
  }
  return snapshots;
}

function renderEvolution() {
  const chart = $("#evolutionChart");
  if (!chart) return;
  const startValue = $("#evolutionStart").value;
  const endValue = $("#evolutionEnd").value;
  const start = startValue ? new Date(`${startValue}T00:00:00`) : null;
  const end = endValue ? new Date(`${endValue}T23:59:59.999`) : null;
  const allSnapshots = evolutionSnapshots();
  const gameIndexes = allSnapshots
    .map((snapshot, index) => ({ snapshot, index }))
    .filter(
      ({ snapshot }) =>
        snapshot.date &&
        (!start || new Date(snapshot.date) >= start) &&
        (!end || new Date(snapshot.date) <= end),
    )
    .map(({ index }) => index);
  const snapshots = gameIndexes.length
    ? [allSnapshots[gameIndexes[0] - 1], ...gameIndexes.map((index) => allSnapshots[index])]
    : [];
  const players = db.players;
  const width = 900;
  const height = 360;
  const padding = { top: 24, right: 24, bottom: 42, left: 52 };
  const colors = ["#c8232c", "#3b6ea8", "#6a4c80", "#b18435", "#23806a", "#d05c2e"];
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const hasGamesInRange = snapshots.some((snapshot) => snapshot.date);
  if (!players.length || !hasGamesInRange) {
    chart.innerHTML = "";
    $("#evolutionLegend").innerHTML = "";
    $("#emptyEvolution").classList.remove("hidden");
    return;
  }
  $("#emptyEvolution").classList.add("hidden");
  const values = snapshots.flatMap((snapshot) => [...snapshot.ratings.values()]);
  const minimum = Math.floor(Math.min(...values) / 10) * 10;
  const maximum = Math.ceil(Math.max(...values) / 10) * 10 || minimum + 10;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (index) => padding.left + (snapshots.length === 1 ? plotWidth / 2 : (index / (snapshots.length - 1)) * plotWidth);
  const y = (value) => padding.top + ((maximum - value) / Math.max(1, maximum - minimum)) * plotHeight;
  const grid = [0, 0.5, 1].map((fraction) => {
    const value = Math.round(maximum - fraction * (maximum - minimum));
    const position = y(value);
    return `<line x1="${padding.left}" y1="${position}" x2="${width - padding.right}" y2="${position}" class="chart-grid"/><text x="${padding.left - 10}" y="${position + 4}" text-anchor="end" class="chart-label">${value}</text>`;
  }).join("");
  const lines = players.map((player, playerIndex) => {
    const color = colors[playerIndex % colors.length];
    const points = snapshots.map((snapshot, index) => `${x(index)},${y(snapshot.ratings.get(player.id) ?? player.startingElo ?? 100)}`).join(" ");
    const dots = snapshots.map((snapshot, index) => `<circle cx="${x(index)}" cy="${y(snapshot.ratings.get(player.id) ?? player.startingElo ?? 100)}" r="4" fill="${color}" class="chart-point" data-player="${esc(player.name)}" data-elo="${snapshot.ratings.get(player.id) ?? player.startingElo ?? 100}" data-date="${snapshot.date || "Inicio"}"/>`).join("");
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>${dots}`;
  }).join("");
  chart.innerHTML = `${grid}${lines}`;
  $("#evolutionLegend").innerHTML = players.map((player, index) => `<span><i class="legend-dot" style="background:${colors[index % colors.length]}"></i>${esc(player.name)}</span>`).join("");
}

function simulateMatchElo(participants) {
  const participantElos = participants.map((player) => player.elo);

  return participants.map((player) => {
    const probability = expected(player.elo, participantElos);
    const actual = player.isWinner ? 1 : 0;
    const change = 25 * (actual - probability);
    const newElo = applyEloChange(player.elo, change);
    const finalDelta = newElo - player.elo;
    return {
      ...player,
      delta: finalDelta,
      newElo,
      result: player.isWinner ? "gana" : "pierde",
    };
  });
}

function renderSimulator() {
  const allPlayers = [...db.players].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const selectedCount = Number($("#simulatorSimulationCount")?.value || 1);

  if (!allPlayers.length) {
    $("#simulatorPlayerSelector").innerHTML = '<p class="text-sm text-[#766b5f]">Necesitas jugadores para simular la partida.</p>';
    $("#simulatorRuns").innerHTML = "";
    const currentSummary = document.getElementById("simulatorSummary");
    if (currentSummary) currentSummary.innerHTML = "";
    return;
  }

  const defaults = new Set(allPlayers.slice(0, Math.min(4, allPlayers.length)).map((player) => player.id));
  const previousSelection = new Set(
    [...document.querySelectorAll(".simulator-player-toggle:checked")].map((input) => input.value),
  );
  const selectedIds = previousSelection.size ? previousSelection : defaults;

  $("#simulatorPlayerSelector").innerHTML = allPlayers
    .map(
      (player) => `
        <label class="flex items-center gap-2 rounded-lg border border-[#ddcdb8] p-2 text-sm font-bold">
          <input
            class="simulator-player-toggle"
            type="checkbox"
            value="${player.id}"
            ${selectedIds.has(player.id) ? "checked" : ""}
          />
          <span>${esc(player.name)}</span>
        </label>
      `,
    )
    .join("");

  const updateSummary = (finalParticipants) => {
    const results = [];
    for (let runIndex = 0; runIndex < selectedCount; runIndex += 1) {
      const winnerSelect = document.querySelector(`.simulator-winner[data-run="${runIndex}"]`);
      const winnerId = winnerSelect?.value || finalParticipants[0]?.id;
      const winnerIndex = finalParticipants.findIndex((player) => player.id === winnerId);

      const ordered = simulateMatchElo(
        finalParticipants.map((player, idx) => ({
          ...player,
          elo: Math.round(player.elo || 100),
          isWinner: idx === winnerIndex,
        })),
      );

      results.push({ runIndex, entries: ordered });
    }

    const summary = results
      .map(
        ({ runIndex, entries }) => `
          <div class="rounded-xl border border-[#ddcdb8] p-4">
            <p class="mb-3 text-sm font-bold text-coral">Resultado simulación ${runIndex + 1}</p>
            ${entries
              .map(
                (entry) => `
                  <div class="mb-2 flex items-center justify-between rounded-lg border border-[#eadfce] p-3">
                    <div>
                      <div class="font-bold">${esc(entry.name)}</div>
                      <div class="text-xs text-[#766b5f]">Elo base: ${Math.round(entry.elo - entry.delta || entry.elo)}</div>
                    </div>
                    <div class="text-right">
                      <div class="font-bold ${entry.delta >= 0 ? "text-coral" : "text-[#766b5f]"}">${entry.delta >= 0 ? "+" : ""}${entry.delta}</div>
                      <div class="text-xs text-[#766b5f]">${entry.result === "gana" ? "Gana" : "Pierde"}</div>
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
        `,
      )
      .join("");

    const currentSummary = document.getElementById("simulatorSummary");
    if (currentSummary) currentSummary.innerHTML = summary;
  };

  const updatePlayerSelection = () => {
    const selected = [...document.querySelectorAll(".simulator-player-toggle:checked")].map((input) => input.value);
    const nextParticipants = allPlayers.filter((player) => selected.includes(player.id));
    const finalParticipants = nextParticipants.length ? nextParticipants : allPlayers.slice(0, Math.min(2, allPlayers.length));

    const currentWinners = {};
    [...document.querySelectorAll(".simulator-winner")].forEach((select) => {
      const runIndex = Number(select.dataset.run);
      currentWinners[runIndex] = select.value;
    });

    const runs = [];
    for (let runIndex = 0; runIndex < selectedCount; runIndex += 1) {
      const fallbackWinner = finalParticipants[runIndex % finalParticipants.length]?.id || finalParticipants[0]?.id;
      const selectedWinner = currentWinners[runIndex] && finalParticipants.some((player) => player.id === currentWinners[runIndex])
        ? currentWinners[runIndex]
        : fallbackWinner;
      const winnerOptions = finalParticipants
        .map((player) => `<option value="${player.id}" ${player.id === selectedWinner ? "selected" : ""}>${esc(player.name)}</option>`)
        .join("");

      runs.push(`
        <div class="rounded-xl border border-[#ddcdb8] p-4">
          <p class="mb-3 text-sm font-bold text-coral">Simulación ${runIndex + 1}</p>
          <label class="block text-sm font-bold">
            Ganador<select class="simulator-winner mt-2 w-full rounded-lg border border-[#cbb99f] bg-white p-3" data-run="${runIndex}">
              ${winnerOptions}
            </select>
          </label>
          <div class="mt-3 space-y-2">
            ${finalParticipants
              .map(
                (player) => `
                  <div class="flex items-center justify-between rounded-lg border border-[#eadfce] p-3">
                    <div>
                      <div class="font-bold">${esc(player.name)}</div>
                      <div class="text-xs text-[#766b5f]">Elo base: ${Math.round(player.elo || 100)}</div>
                    </div>
                    <div class="text-xs font-bold text-[#766b5f]">—</div>
                  </div>
                `,
              )
              .join("")}
          </div>
        </div>
      `);
    }

    $("#simulatorRuns").innerHTML = runs.join("");

    [...document.querySelectorAll(".simulator-winner")].forEach((select) => {
      select.onchange = () => updateSummary(finalParticipants);
    });

    updateSummary(finalParticipants);
  };

  [...document.querySelectorAll(".simulator-player-toggle")].forEach((input) => {
    input.onchange = updatePlayerSelection;
  });

  updatePlayerSelection();
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
      (g) => {
        const winner = db.players.find((player) => player.id === g.players[0]);
        const losers = g.players
          .slice(1)
          .map((id) => db.players.find((player) => player.id === id))
          .sort((a, b) => (a?.name || "").localeCompare(b?.name || "", "es"));
        return `<article class="panel flex items-center justify-between gap-4 rounded-xl p-4"><div><p class="text-xs font-bold uppercase tracking-wider text-[#766b5f]">${dateText(g.date)} · ${combinationLabel(db.decks.find((deck) => deck.id === g.deckId), g.editions || g.combinationId)}</p><p class="mt-2"><strong class="text-coral">Ganador:</strong> <b>${esc(winner?.name || "Jugador eliminado")}</b></p><p class="mt-1"><strong>Perdedores:</strong> ${losers.map((player) => esc(player?.name || "Jugador eliminado")).join(", ")}</p></div><div class="flex gap-3"><button class="editGame text-sm font-bold text-coral" data-id="${g.id}">Editar</button><button class="deleteGame rounded-lg border border-[#ddcdb8] px-3 py-2 text-sm font-bold text-[#b84339] hover:bg-red-50" data-id="${g.id}">Eliminar</button></div></article>`;
      },
    )
    .join("");
  const playersSortMode = $("#playerSortSelect")?.value || "alphabetic";
  const orderedPlayers = sortPlayers(db.players, playersSortMode);
  $("#playersBody").innerHTML = orderedPlayers
    .map(
      (p) =>
        `<article class="panel flex items-center justify-between rounded-xl p-4"><div><b>${esc(p.name)}</b><p class="text-sm text-[#766b5f]">Elo ${p.elo} · Base ${p.startingElo ?? 100} · ${p.games} partidas</p></div><div class="flex gap-3"><button class="editPlayer text-sm font-bold text-coral" data-id="${p.id}">Editar</button><button class="deletePlayer text-sm font-bold text-[#b84339]" data-id="${p.id}">Eliminar</button></div></article>`,
    )
    .join("");
  $("#decksBody").innerHTML = db.decks
    .map(
      (deck) =>
        `<article class="panel flex items-center justify-between rounded-xl p-4"><div><b>${esc(deckLabel(deck))}</b><p class="text-sm text-[#766b5f]">Hasta edición ${deck.maxEdition || 1} · ${db.games.filter((game) => game.deckId === deck.id).length} partidas</p></div><div class="flex gap-3"><button class="editDeck text-sm font-bold text-coral" data-id="${deck.id}">Editar</button><button class="deleteDeck text-sm font-bold text-[#b84339]" data-id="${deck.id}">Eliminar</button></div></article>`,
    )
    .join("");
  renderEvolution();
}

function deckInputs() {
  $("#deckSelect").innerHTML = db.decks.length
    ? `<option value="">Selecciona baraja</option>${db.decks
        .map((deck) => `<option value="${deck.id}">${esc(deckLabel(deck))}</option>`)
        .join("")}`
    : '<option value="">Sin barajas: añade una primero</option>';
  $("#deckSelect").disabled = !db.decks.length;

  if (db.decks.length === 1) {
    $("#deckSelect").value = db.decks[0].id;
  }

  editionInputs([1]);
}

function editionInputs(selectedEditions = [1]) {
  const deckId = $("#deckSelect").value;
  const deck = db.decks.find((item) => item.id === deckId);
  const maxEdition = deck?.maxEdition || 0;

  const rawSelection = Array.isArray(selectedEditions)
    ? selectedEditions
    : [1];
  const selectedSet = new Set(
    rawSelection
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= maxEdition),
  );

  if (maxEdition > 0) selectedSet.add(1);

  $("#editionChecks").innerHTML = maxEdition
    ? `<p class="mb-2 text-sm font-bold">Ediciones incluidas</p><div class="edition-options">${Array.from({ length: maxEdition }, (_, index) => {
        const edition = index + 1;
        const required = edition === 1;
        return `<label class="edition-option${required ? " edition-required" : ""}" title="${required ? "La edición 1 siempre está incluida" : `Seleccionar edición ${edition}`}" aria-label="${required ? "Edición 1, siempre incluida" : `Seleccionar edición ${edition}`}" ><input class="edition-check" type="checkbox" value="${edition}" ${selectedSet.has(edition) ? "checked" : ""} ${required ? "checked disabled" : ""}/><span>${edition}</span></label>`;
      }).join("")}</div>`
    : '<p class="text-sm text-[#766b5f]">Selecciona una baraja</p>';
}

function participantInputs() {
  const count = +$("#playerCount").value;
  const selectedIds = [...document.querySelectorAll(".participant")].map(
    (select) => select.value,
  );
  const players = [...db.players].sort((a, b) => a.name.localeCompare(b.name, "es"));
  $("#participantFields").innerHTML = Array.from(
    { length: count },
    (_, i) => {
      const label = `Participante ${i + 1}`;
      const options = [
        '<option value="">Selecciona jugador</option>',
        ...players.map(
          (p) => `<option value="${p.id}">${esc(p.name)} (Elo ${p.elo})</option>`,
        ),
      ].join("");

      return `<label class="block text-sm font-bold">${label}<select class="participant mt-1 w-full rounded-lg border border-[#cbb99f] bg-white p-3">${options.replace(`<option value="${selectedIds[i]}">`, `<option value="${selectedIds[i]}" selected>` )}</select></label>`;
    },
  ).join("");
  winnerInputs();
}

function winnerInputs() {
  const gameCount = +$("#gameCountInput").value;
  const options = [...document.querySelectorAll(".participant")]
    .map((select) => select.value)
    .filter(Boolean)
    .map((id) => db.players.find((player) => player.id === id))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const playerOptions = options.length
    ? `<option value="">Selecciona ganador</option>${options.map((player) => `<option value="${player.id}">${esc(player.name)}</option>`).join("")}`
    : '<option value="">Selecciona primero los participantes</option>';
  $("#winnerFields").innerHTML = Array.from(
    { length: gameCount },
    (_, index) => `<label class="block text-sm font-bold">Ganador partida ${index + 1}<select class="winner-select mt-1 w-full rounded-lg border border-[#cbb99f] bg-white p-3">${playerOptions}</select></label>`,
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
    toast("Modo solo lectura: falta configurar el token", true);
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
    normalizePlayers();
    normalizeDecks();
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
  const current = config();
  localStorage.setItem(
    KEY,
    JSON.stringify({
      owner: $("#ghOwner").value.trim() || DEFAULT_CONFIG.owner,
      repo: $("#ghRepo").value.trim() || DEFAULT_CONFIG.repo,
      branch: $("#ghBranch").value.trim() || DEFAULT_CONFIG.branch,
      token: $("#ghToken").value.trim() || current.token,
    }),
  );
  show("#settingsModal", false);
  startAutoSync();
  loadRemote();
};

$("#refreshBtn").onclick = () => loadRemote();
$("#newGameBtn").onclick = () => {
  if (!ensureCanEdit()) return;
  if (db.players.length < 2)
    return toast("Necesitas al menos 2 jugadores", true);
  $("#gameCountInput").value = 1;
  $("#playerCount").value = 2;
  editingGameId = null;
  $("#gameModalTitle").textContent = "Nuevas partidas";
  $("#gameDate").value = dateInputValue(new Date().toISOString());
  deckInputs();
  participantInputs();
  show("#gameModal");
};
$("#playerCount").onchange = participantInputs;
$("#gameCountInput").onchange = winnerInputs;
$("#participantFields").onchange = winnerInputs;
$("#simulatorSimulationCount").onchange = renderSimulator;
$("#playerSortSelect").onchange = render;
$("#evolutionStart").onchange = renderEvolution;
$("#evolutionEnd").onchange = renderEvolution;
document.addEventListener("click", (event) => {
  const editButton = event.target.closest(".editGame");
  if (!editButton || !ensureCanEdit()) return;
  const game = db.games.find((item) => item.id === editButton.dataset.id);
  if (!game) return;
  editingGameId = game.id;
  $("#gameModalTitle").textContent = "Editar partida";
  $("#gameCountInput").value = 1;
  $("#playerCount").value = game.players.length;
  $("#gameDate").value = dateInputValue(game.date);
  $("#deckSelect").value = game.deckId || "";
  editionInputs(game.editions || [1]);
  participantInputs();
  document.querySelectorAll(".participant").forEach((select, index) => {
    select.value = game.players[index] || "";
  });
  winnerInputs();
  document.querySelectorAll(".winner-select").forEach((select) => {
    select.value = game.players[0];
  });
  show("#gameModal");
});
$("#saveGameBtn").onclick = async () => {
  if (!ensureCanEdit()) return;
  const ids = [...document.querySelectorAll(".participant")].map((x) => x.value.trim());
  if (ids.some((id) => !id))
    return toast("Selecciona todos los participantes", true);
  if (new Set(ids).size !== ids.length)
    return toast("No repitas jugadores", true);
  const deckId = $("#deckSelect").value;
  const editions = [...document.querySelectorAll(".edition-check:checked")].map((input) => Number(input.value));
  if (!deckId || !editions.length)
    return toast("Selecciona una baraja y al menos una edición", true);
  const winners = [...document.querySelectorAll(".winner-select")].map((select) => select.value);
  if (winners.some((id) => !id))
    return toast("Selecciona el ganador de cada partida", true);
  const dateValue = $("#gameDate").value;
  if (!dateValue) return toast("Selecciona una fecha", true);
  if (editingGameId) {
    const game = db.games.find((item) => item.id === editingGameId);
    const date = new Date(`${dateValue}T12:00:00`).toISOString();
    if (!game) return toast("No se encontró la partida", true);
    game.date = date;
    game.players = [winners[0], ...ids.filter((id) => id !== winners[0])];
    game.deckId = deckId;
    game.editions = editions;
    show("#gameModal", false);
    render();
    await persist("Modificar partida");
    return;
  }
  winners.forEach((winnerId) => {
    const players = [winnerId, ...ids.filter((id) => id !== winnerId)];
    const date = new Date(`${dateValue}T12:00:00`).toISOString();
    db.games.push({ id: crypto.randomUUID(), date, players, deckId, editions });
    players.forEach((id) => {
      const player = db.players.find((item) => item.id === id);
      if (player) player.lastGame = date;
    });
  });
  show("#gameModal", false);
  render();
  await persist("Registrar partidas");
};
function openDeckModal() {
  if (!ensureCanEdit()) return;
  editingDeckId = null;
  $("#deckModalTitle").textContent = "Nueva baraja";
  $("#deckName").value = "";
  $("#deckMaxEdition").value = 1;
  show("#deckModal");
}
$("#addDeckBtn").onclick = openDeckModal;
$("#manageDeckBtn").onclick = openDeckModal;
$("#deckSelect").onchange = () => editionInputs([1]);
$("#saveDeckBtn").onclick = async () => {
  if (!ensureCanEdit()) return;
  const name = $("#deckName").value.trim();
  const maxEdition = Number($("#deckMaxEdition").value);
  if (!name || !Number.isInteger(maxEdition) || maxEdition < 1 || maxEdition > 20)
    return toast("Escribe un nombre y un número de edición válido", true);
  const existing = db.decks.find((deck) => deck.id === editingDeckId);
  const deck = { id: editingDeckId || crypto.randomUUID(), name, maxEdition };
  if (existing) db.decks[db.decks.indexOf(existing)] = deck;
  else db.decks.push(deck);
  show("#deckModal", false);
  render();
  await persist(existing ? "Modificar baraja" : "Añadir baraja");
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
    player.startingElo = elo;
    player.initialElo = 100;
  } else
    db.players.push({
      id: crypto.randomUUID(),
      name,
      initialElo: 100,
      startingElo: elo,
      elo,
      wins: 0,
      losses: 0,
      games: 0,
    });
  show("#playerModal", false);
  render();
  await persist(editingId ? "Modificar jugador" : "Añadir jugador");
};

// Un único listener gestiona los botones que se crean dinámicamente al renderizar.
document.addEventListener("click", async (e) => {
  const requiredEdition = e.target.closest(".edition-required");
  if (requiredEdition) {
    requiredEdition.classList.remove("edition-shake");
    void requiredEdition.offsetWidth;
    requiredEdition.classList.add("edition-shake");
    toast("La edición 1 siempre está incluida");
    return;
  }
  const close = e.target.closest("[data-close]");
  if (close) show("#" + close.dataset.close, false);
  const tab = e.target.closest(".tab");
  if (tab) {
    document
      .querySelectorAll(".tab")
      .forEach((x) => x.classList.remove("active"));
    tab.classList.add("active");
    ["ranking", "history", "players", "decks", "simulator", "evolution"].forEach((v) =>
      $("#" + v + "View").classList.toggle("hidden", v !== tab.dataset.view),
    );
    if (tab.dataset.view === "simulator") renderSimulator();
  }
  const ep = e.target.closest(".editPlayer");
  if (ep && ensureCanEdit()) {
    const player = db.players.find((p) => p.id === ep.dataset.id);
    if (player) {
      editingId = player.id;
      $("#playerModalTitle").textContent = "Editar jugador";
      $("#savePlayerBtn").textContent = "Guardar cambios";
      $("#playerName").value = player.name;
      $("#playerElo").value = player.startingElo ?? player.initialElo ?? 100;
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
    render();
    await persist("Eliminar jugador");
  }
  const ed = e.target.closest(".editDeck");
  if (ed && ensureCanEdit()) {
    const deck = db.decks.find((item) => item.id === ed.dataset.id);
    if (deck) {
      editingDeckId = deck.id;
      $("#deckModalTitle").textContent = "Editar baraja";
      $("#deckName").value = deck.name;
      $("#deckMaxEdition").value = deck.maxEdition || deck.units?.length || 1;
      show("#deckModal");
    }
  }
  const dd = e.target.closest(".deleteDeck");
  if (dd && ensureCanEdit()) {
    const isUsed = db.games.some((game) => game.deckId === dd.dataset.id);
    if (isUsed) return toast("No puedes eliminar una baraja ya usada", true);
    if (!confirm("¿Eliminar esta baraja?")) return;
    db.decks = db.decks.filter((deck) => deck.id !== dd.dataset.id);
    render();
    await persist("Eliminar baraja");
  }
});
document.addEventListener("pointerover", (e) => {
  const point = e.target.closest(".chart-point");
  if (!point) return;
  const tooltip = $("#chartTooltip");
  tooltip.innerHTML = `<b>${point.dataset.player}</b><br>${point.dataset.elo} Elo<br><span>${point.dataset.date === "Inicio" ? "Inicio" : dateText(point.dataset.date)}</span>`;
  tooltip.classList.remove("hidden");
  tooltip.style.left = `${e.clientX + 12}px`;
  tooltip.style.top = `${e.clientY + 12}px`;
});
document.addEventListener("pointermove", (e) => {
  if (!e.target.closest(".chart-point")) return;
  const tooltip = $("#chartTooltip");
  tooltip.style.left = `${e.clientX + 12}px`;
  tooltip.style.top = `${e.clientY + 12}px`;
});
document.addEventListener("pointerout", (e) => {
  if (e.target.closest(".chart-point")) $("#chartTooltip").classList.add("hidden");
});
loadRemote();
if (config().token) startAutoSync();
