import { captureFromText, hostnameFor } from "./parser.js";

const KEYS = {
  items: "glimmer.items.v1",
  positions: "glimmer.positions.v1",
  hidden: "glimmer.hidden.v1",
};

const TYPE_LABELS = {
  site: "a place",
  sound: "a moment in sound",
  image: "an image",
  note: "a thought",
};

const ACCENTS = ["cream", "sage", "yellow", "pink", "blue"];

const state = {
  bundled: [],
  local: readJson(KEYS.items, []),
  hidden: new Set(readJson(KEYS.hidden, [])),
  positions: readJson(KEYS.positions, {}),
  filter: "all",
  query: "",
  activeId: null,
};

const els = {
  board: document.querySelector("#board"),
  cardTemplate: document.querySelector("#card-template"),
  count: document.querySelector("#count"),
  empty: document.querySelector("#empty-state"),
  filters: document.querySelector("#filters"),
  search: document.querySelector("#search"),
  addButton: document.querySelector("#add-button"),
  addDialog: document.querySelector("#add-dialog"),
  addForm: document.querySelector("#add-form"),
  captureInput: document.querySelector("#capture-input"),
  titleInput: document.querySelector("#title-input"),
  imageInput: document.querySelector("#image-input"),
  detailDialog: document.querySelector("#detail-dialog"),
  detailContent: document.querySelector("#detail-content"),
  stirButton: document.querySelector("#stir-button"),
  exportButton: document.querySelector("#export-button"),
  importInput: document.querySelector("#import-input"),
  toast: document.querySelector("#toast"),
};

init();

async function init() {
  try {
    const response = await fetch("./data/things.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load collection (${response.status})`);
    state.bundled = await response.json();
  } catch (error) {
    console.warn(error);
    showToast("The shared collection could not be loaded. Your local things are still here.");
  }

  bindEvents();
  render();
}

function bindEvents() {
  els.addButton.addEventListener("click", openAdd);
  document.querySelectorAll("[data-open-add]").forEach((button) => button.addEventListener("click", openAdd));
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => button.closest("dialog")?.close());
  });

  els.addForm.addEventListener("submit", addFromForm);
  els.search.addEventListener("input", (event) => {
    state.query = event.currentTarget.value.trim().toLowerCase();
    render();
  });

  els.filters.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-filter]");
    if (!filter) return;
    state.filter = filter.dataset.filter;
    els.filters.querySelectorAll(".filter").forEach((button) => {
      button.classList.toggle("is-active", button === filter);
    });
    render();
  });

  els.stirButton.addEventListener("click", stirTable);
  els.exportButton.addEventListener("click", exportCollection);
  els.importInput.addEventListener("change", importCollection);

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !isEditing()) {
      event.preventDefault();
      els.search.focus();
    }
    if (event.key.toLowerCase() === "n" && !isEditing() && !document.querySelector("dialog[open]")) {
      event.preventDefault();
      openAdd();
    }
  });
}

function allItems() {
  const byId = new Map();
  [...state.bundled, ...state.local].forEach((item) => byId.set(item.id, item));
  return [...byId.values()].filter((item) => !state.hidden.has(item.id));
}

function visibleItems() {
  return allItems().filter((item) => {
    const matchesType = state.filter === "all" || item.type === state.filter;
    const haystack = [item.title, item.note, item.caption, item.url, item.type].filter(Boolean).join(" ").toLowerCase();
    return matchesType && (!state.query || haystack.includes(state.query));
  });
}

function render() {
  els.board.querySelectorAll(".glimmer-card").forEach((card) => card.remove());
  const items = visibleItems();
  items.forEach((item, index) => els.board.append(createCard(item, index)));

  const total = allItems().length;
  els.count.textContent = `${items.length}${items.length !== total ? ` of ${total}` : ""} ${pluralize(total, "glimmer")}`;
  els.empty.hidden = items.length > 0;
}

function createCard(item, index) {
  const fragment = els.cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".glimmer-card");
  const position = state.positions[item.id] || item;
  const fallback = fallbackPosition(index);

  card.dataset.id = item.id;
  card.dataset.type = item.type;
  card.dataset.accent = item.accent || ACCENTS[index % ACCENTS.length];
  card.style.setProperty("--x", `${numberOr(position.x, fallback.x)}px`);
  card.style.setProperty("--y", `${numberOr(position.y, fallback.y)}px`);
  card.style.setProperty("--r", `${numberOr(position.rotation, fallback.rotation)}deg`);

  card.querySelector(".type-label").textContent = TYPE_LABELS[item.type] || item.type;
  card.querySelector("time").textContent = formatDate(item.capturedAt);
  card.querySelector(".card-title").textContent = item.title || "untitled glimmer";
  card.querySelector(".card-note").textContent = item.note || item.caption || "";

  if (item.timecode?.label) {
    const timecode = card.querySelector(".timecode");
    timecode.hidden = false;
    timecode.textContent = item.timecode.label;
  }

  if (item.url) {
    const link = card.querySelector(".card-link");
    link.href = item.url;
    link.querySelector(".link-host").textContent = hostnameFor(item.url);
  }

  hydrateCardImage(card, item);
  card.querySelector(".card-open").addEventListener("click", () => openDetail(item.id));
  bindDrag(card, item);
  return card;
}

async function hydrateCardImage(card, item) {
  let src = item.image || "";
  if (!src && item.imageKey) {
    const blob = await imageStore.get(item.imageKey);
    if (blob) src = URL.createObjectURL(blob);
  }
  if (!src) return;

  const media = card.querySelector(".card-media");
  const img = document.createElement("img");
  img.src = src;
  img.alt = item.imageAlt || item.title || "Saved image";
  img.loading = "lazy";
  media.append(img);
  media.hidden = false;
}

function bindDrag(card, item) {
  const handle = card.querySelector(".drag-handle");
  let start = null;

  handle.addEventListener("pointerdown", (event) => {
    if (matchMedia("(max-width: 880px)").matches) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const current = state.positions[item.id] || item;
    const fallback = fallbackPosition(0);
    start = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: numberOr(current.x, fallback.x),
      y: numberOr(current.y, fallback.y),
      rotation: numberOr(current.rotation, 0),
    };
    card.classList.add("is-dragging");
  });

  handle.addEventListener("pointermove", (event) => {
    if (!start) return;
    const x = Math.max(0, start.x + event.clientX - start.pointerX);
    const y = Math.max(0, start.y + event.clientY - start.pointerY);
    card.style.setProperty("--x", `${x}px`);
    card.style.setProperty("--y", `${y}px`);
    state.positions[item.id] = { x, y, rotation: start.rotation };
  });

  const finish = () => {
    if (!start) return;
    start = null;
    card.classList.remove("is-dragging");
    localStorage.setItem(KEYS.positions, JSON.stringify(state.positions));
  };

  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}

function openAdd() {
  els.addForm.reset();
  els.addDialog.showModal();
  requestAnimationFrame(() => els.captureInput.focus());
}

async function addFromForm(event) {
  event.preventDefault();
  const text = els.captureInput.value.trim();
  const file = els.imageInput.files?.[0];
  if (!text && !file) return;

  let imageKey = "";
  if (file) {
    imageKey = crypto.randomUUID();
    await imageStore.put(imageKey, file);
  }

  const captured = captureFromText(text || file?.name || "", {
    title: els.titleInput.value,
    imageKey,
  });
  const item = {
    id: crypto.randomUUID(),
    ...captured,
    ...(imageKey ? { imageKey, imageAlt: els.titleInput.value || file.name } : {}),
    capturedAt: new Date().toISOString(),
    accent: ACCENTS[Math.floor(Math.random() * ACCENTS.length)],
    ...newItemPosition(),
  };

  state.local.push(item);
  saveLocalItems();
  els.addDialog.close();
  state.filter = "all";
  state.query = "";
  els.search.value = "";
  els.filters.querySelectorAll(".filter").forEach((button) => button.classList.toggle("is-active", button.dataset.filter === "all"));
  render();
  showToast("kept ✦");
}

async function openDetail(id) {
  const item = allItems().find((candidate) => candidate.id === id);
  if (!item) return;
  state.activeId = id;
  els.detailContent.replaceChildren();

  let imageSrc = item.image || "";
  if (!imageSrc && item.imageKey) {
    const blob = await imageStore.get(item.imageKey);
    if (blob) imageSrc = URL.createObjectURL(blob);
  }

  if (imageSrc) {
    const img = document.createElement("img");
    img.className = "detail-image";
    img.src = imageSrc;
    img.alt = item.imageAlt || item.title || "Saved image";
    els.detailContent.append(img);
  }

  const meta = document.createElement("div");
  meta.className = "detail-meta";
  meta.innerHTML = `<span>${escapeHtml(TYPE_LABELS[item.type] || item.type)}</span><span>${escapeHtml(formatLongDate(item.capturedAt))}</span>`;
  els.detailContent.append(meta);

  const title = document.createElement("h2");
  title.textContent = item.title || "untitled glimmer";
  els.detailContent.append(title);

  if (item.note) {
    const note = document.createElement("p");
    note.className = "detail-note";
    note.textContent = item.note;
    els.detailContent.append(note);
  }

  if (item.caption) {
    const caption = document.createElement("p");
    caption.className = "detail-caption";
    caption.textContent = item.caption;
    els.detailContent.append(caption);
  }

  if (item.timecode?.label) {
    const time = document.createElement("div");
    time.className = "timecode";
    time.textContent = item.timecode.label;
    els.detailContent.append(time);
  }

  const actions = document.createElement("div");
  actions.className = "detail-actions";
  const group = document.createElement("div");
  group.className = "detail-actions-group";

  if (item.url) {
    const visit = document.createElement("a");
    visit.className = "button button-primary";
    visit.href = item.url;
    visit.target = "_blank";
    visit.rel = "noreferrer";
    visit.textContent = "visit ↗";
    group.append(visit);
  }

  const close = document.createElement("button");
  close.className = "button";
  close.type = "button";
  close.textContent = "close";
  close.addEventListener("click", () => els.detailDialog.close());
  group.append(close);

  const remove = document.createElement("button");
  remove.className = "quiet-button danger-button";
  remove.type = "button";
  remove.textContent = "let this one go";
  remove.addEventListener("click", () => removeItem(item));

  actions.append(remove, group);
  els.detailContent.append(actions);
  els.detailDialog.showModal();
}

async function removeItem(item) {
  const localIndex = state.local.findIndex((candidate) => candidate.id === item.id);
  if (localIndex >= 0) {
    const [removed] = state.local.splice(localIndex, 1);
    if (removed.imageKey) await imageStore.delete(removed.imageKey);
    saveLocalItems();
  } else {
    state.hidden.add(item.id);
    localStorage.setItem(KEYS.hidden, JSON.stringify([...state.hidden]));
  }

  delete state.positions[item.id];
  localStorage.setItem(KEYS.positions, JSON.stringify(state.positions));
  els.detailDialog.close();
  render();
  showToast("let go");
}

function stirTable() {
  const items = visibleItems();
  const width = Math.max(900, els.board.clientWidth - 380);
  const height = Math.max(620, els.board.clientHeight - 350);
  items.forEach((item, index) => {
    state.positions[item.id] = {
      x: 70 + ((index * 293 + Math.random() * 170) % width),
      y: 130 + ((index * 211 + Math.random() * 140) % height),
      rotation: -3.5 + Math.random() * 7,
    };
  });
  localStorage.setItem(KEYS.positions, JSON.stringify(state.positions));
  render();
  showToast("the table has shifted");
}

async function exportCollection() {
  const items = structuredClone(allItems());
  for (const item of items) {
    if (item.imageKey) {
      const blob = await imageStore.get(item.imageKey);
      if (blob) item.embeddedImage = await blobToDataUrl(blob);
    }
    const position = state.positions[item.id];
    if (position) Object.assign(item, position);
  }

  const payload = {
    format: "glimmer-collection",
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `glimmers-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
  showToast("your copy is ready");
}

async function importCollection(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(incoming)) throw new Error("No items found");

    const existingIds = new Set(allItems().map((item) => item.id));
    let added = 0;
    for (const raw of incoming) {
      if (!raw || typeof raw !== "object") continue;
      const item = structuredClone(raw);
      item.id = existingIds.has(item.id) || !item.id ? crypto.randomUUID() : item.id;
      if (item.embeddedImage) {
        item.imageKey = crypto.randomUUID();
        await imageStore.put(item.imageKey, dataUrlToBlob(item.embeddedImage));
        delete item.embeddedImage;
      }
      state.local.push(item);
      existingIds.add(item.id);
      added += 1;
    }
    saveLocalItems();
    render();
    showToast(`${added} ${pluralize(added, "glimmer")} brought in`);
  } catch (error) {
    console.error(error);
    showToast("that file doesn’t look like a glimmer collection");
  } finally {
    event.currentTarget.value = "";
  }
}

function newItemPosition() {
  const index = allItems().length;
  return {
    x: 100 + ((index * 287) % 920),
    y: 130 + ((index * 193) % 530),
    rotation: -2.7 + (index % 6) * 1.1,
  };
}

function fallbackPosition(index) {
  return {
    x: 100 + ((index * 287) % 1020),
    y: 130 + ((index * 193) % 570),
    rotation: -2.7 + (index % 6) * 1.1,
  };
}

function saveLocalItems() {
  localStorage.setItem(KEYS.items, JSON.stringify(state.local));
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value) {
  if (!value) return "sometime";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "sometime";
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function formatLongDate(value) {
  if (!value) return "kept sometime";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "kept sometime";
  return `kept ${date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`;
}

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function isEditing() {
  return ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
}

function pluralize(count, word) {
  return count === 1 ? word : `${word}s`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

let toastTimer;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, payload] = dataUrl.split(",");
  const mime = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const binary = atob(payload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

const imageStore = {
  async db() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("glimmer-images", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("images");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  async get(key) {
    return this.run("readonly", (store) => store.get(key));
  },
  async put(key, blob) {
    return this.run("readwrite", (store) => store.put(blob, key));
  },
  async delete(key) {
    return this.run("readwrite", (store) => store.delete(key));
  },
  async run(mode, operation) {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("images", mode);
      const request = operation(transaction.objectStore("images"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
  },
};

