const MODULE_ID = "actor-jb2a-animations";
const FLAG_SCOPE = MODULE_ID;
const FLAG_KEY = "animations";
const DEFAULT_TARGET_MODE = "none";
const HEADER_BUTTON_CLASS = "actor-jb2a-animations-header-button";

const TARGET_MODE_OPTIONS = [
  { value: "none", label: "No target" },
  { value: "single", label: "Single target" },
  { value: "multi", label: "Multiple targets" },
  { value: "chain", label: "Chain" },
  { value: "onTargets", label: "On targets" }
];

Hooks.once("init", () => {
  const api = {
    getActorAnimations,
    setActorAnimations,
    playAnimationByName,
    playAnimationByIndex,
    playConfiguredAnimation,
    openAnimationManager
  };

  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = api;
  globalThis.ActorJB2AAnimations = api;

  console.log(`${MODULE_ID} | Initialized for Foundry V13`);
});

Hooks.on("renderApplicationV2", (app, element) => {
  queueHeaderButtonInjection(app, element);
});

function queueHeaderButtonInjection(app, element) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      tryInjectHeaderButton(app, element);
    }, 0);
  });
}

function tryInjectHeaderButton(app, element) {
  try {
    const actor = app?.document ?? app?.actor ?? null;
    if (!(actor instanceof Actor)) return;
    if (!actor.isOwner) return;

    const root = getRootElement(app, element);
    if (!(root instanceof HTMLElement)) return;

    if (root.querySelector(`.${HEADER_BUTTON_CLASS}`)) return;

    const header = findWindowHeader(root);
    if (!(header instanceof HTMLElement)) return;

    const button = createHeaderButton(actor);
    header.appendChild(button);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to inject header button`, err);
  }
}

function getRootElement(app, element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  if (app?.element instanceof HTMLElement) return app.element;
  if (app?.element?.[0] instanceof HTMLElement) return app.element[0];
  return null;
}

function findWindowHeader(root) {
  const selectors = [
    ".window-header",
    "header.window-header",
    ".application-header",
    "header.application-header"
  ];

  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }

  return null;
}

function createHeaderButton(actor) {
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add(HEADER_BUTTON_CLASS);
  button.title = "JB2A Animations";
  button.setAttribute("aria-label", "JB2A Animations");
  button.innerHTML = `<i class="fas fa-bolt"></i>`;

  Object.assign(button.style, {
    marginLeft: "6px",
    width: "28px",
    height: "28px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center"
  });

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openAnimationManager(actor);
  });

  return button;
}

async function openAnimationManager(actor) {
  const animations = await getActorAnimations(actor);

  const dialog = new Dialog(
    {
      title: `JB2A Animations: ${actor.name}`,
      content: buildManagerHtml(animations),
      buttons: {
        save: {
          label: "Save",
          callback: async (html) => {
            const parsed = parseAnimationsFromHtml(html);
            await setActorAnimations(actor, parsed);
            ui.notifications.info(`Saved animations for ${actor.name}.`);
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "save",
      render: (html) => activateManagerListeners(html)
    },
    {
      width: 720,
      height: 700,
      resizable: true
    }
  );

  dialog.render(true);
}

function buildManagerHtml(animations) {
  return `
    <div class="jb2a-manager">
      <p class="notes">Configure JB2A and Sequencer animations for this actor.</p>

      <div class="jb2a-manager-list">
        ${animations.map((anim, index) => buildAnimationRowHtml(anim, index)).join("")}
      </div>

      <div class="jb2a-manager-actions">
        <button type="button" data-action="add-row">
          <i class="fas fa-plus"></i> Add animation
        </button>
      </div>
    </div>
  `;
}

function buildAnimationRowHtml(anim = {}, index = 0) {
  const normalized = normalizeAnimationData(anim);

  return `
    <div class="jb2a-animation-row" data-index="${index}" data-id="${escapeHtml(normalized.id)}">
      <div class="form-group">
        <label>Name</label>
        <input type="text" data-field="name" value="${escapeHtml(normalized.name)}" placeholder="Magic Missile">
      </div>

      <div class="form-group">
        <label>Animation</label>
        <div class="jb2a-inline-group">
          <input type="text" data-field="animation" value="${escapeHtml(normalized.animation)}" placeholder="jb2a.magic_missile.blue">
          <button type="button" data-action="pick-animation">Pick</button>
        </div>
      </div>

      <div class="form-group">
        <label>Target mode</label>
        <select data-field="targetMode">
          ${TARGET_MODE_OPTIONS.map((opt) => `
            <option value="${escapeHtml(opt.value)}" ${normalized.targetMode === opt.value ? "selected" : ""}>
              ${escapeHtml(opt.label)}
            </option>
          `).join("")}
        </select>
      </div>

      <div class="form-group jb2a-checkbox-group">
        <label>Persist</label>
        <input type="checkbox" data-field="persist" ${normalized.persist ? "checked" : ""}>
      </div>

      <div>
        <button type="button" data-action="remove-row">
          <i class="fas fa-trash"></i> Remove
        </button>
      </div>
    </div>
  `;
}

function activateManagerListeners(html) {
  const root = html[0];
  if (!root) return;

  const list = root.querySelector(".jb2a-manager-list");
  const addButton = root.querySelector('[data-action="add-row"]');

  addButton?.addEventListener("click", (event) => {
    event.preventDefault();
    const index = list.querySelectorAll(".jb2a-animation-row").length;
    list.insertAdjacentHTML("beforeend", buildAnimationRowHtml({}, index));
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const row = button.closest(".jb2a-animation-row");

    if (action === "remove-row") {
      event.preventDefault();
      row?.remove();
      reindexRows(list);
      return;
    }

    if (action === "pick-animation") {
      event.preventDefault();
      if (!row) return;
      await openSequencerPickerForRow(row);
    }
  });
}

function reindexRows(list) {
  const rows = Array.from(list.querySelectorAll(".jb2a-animation-row"));
  rows.forEach((row, index) => {
    row.dataset.index = String(index);
  });
}

function parseAnimationsFromHtml(html) {
  const root = html[0] ?? html;
  const rows = Array.from(root.querySelectorAll(".jb2a-animation-row"));

  return rows.map((row) =>
    normalizeAnimationData({
      id: row.dataset.id || foundry.utils.randomID(),
      name: row.querySelector('[data-field="name"]')?.value ?? "",
      animation: row.querySelector('[data-field="animation"]')?.value ?? "",
      targetMode: row.querySelector('[data-field="targetMode"]')?.value ?? DEFAULT_TARGET_MODE,
      persist: row.querySelector('[data-field="persist"]')?.checked ?? false
    })
  );
}

async function openSequencerPickerForRow(row) {
  if (!game.modules.get("sequencer")?.active) {
    ui.notifications.warn("Sequencer must be active to use the picker.");
    return;
  }

  const entries = collectSequencerEntries();
  if (!entries.length) {
    ui.notifications.warn("No Sequencer database entries were found.");
    return;
  }

  new Dialog({
    title: "Pick JB2A Animation",
    content: `
      <form>
        <div class="form-group">
          <label>Animation</label>
          <select name="animation" style="width:100%;">
            ${entries.map((entry) => `
              <option value="${escapeHtml(entry)}">${escapeHtml(entry)}</option>
            `).join("")}
          </select>
        </div>
      </form>
    `,
    buttons: {
      ok: {
        label: "Select",
        callback: (html) => {
          const value = html.find('[name="animation"]').val();
          const input = row.querySelector('[data-field="animation"]');
          if (input) input.value = value;
        }
      },
      cancel: {
        label: "Cancel"
      }
    },
    default: "ok"
  }).render(true);
}

async function getActorAnimations(actor) {
  if (!actor) return [];
  const raw = foundry.utils.deepClone(actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? []);
  return raw.map(normalizeAnimationData);
}

async function setActorAnimations(actor, animations) {
  if (!actor) return;
  const normalized = (animations ?? []).map(normalizeAnimationData);
  await actor.setFlag(FLAG_SCOPE, FLAG_KEY, normalized);
}

function normalizeAnimationData(anim = {}) {
  return {
    id: String(anim.id ?? foundry.utils.randomID()),
    name: String(anim.name ?? "").trim(),
    animation: String(anim.animation ?? "").trim(),
    targetMode: String(anim.targetMode ?? DEFAULT_TARGET_MODE),
    persist: Boolean(anim.persist)
  };
}

function collectSequencerEntries() {
  const results = new Set();
  const db = globalThis.Sequencer?.Database;
  if (!db) return [];

  const root = db.entries || db._entries || db.database || null;
  if (root) walkSequencerTree(root, "", results);

  if (!results.size && typeof db.getPathsUnder === "function") {
    try {
      for (const entry of db.getPathsUnder("jb2a") ?? []) {
        results.add(entry);
      }
    } catch (_err) {}
  }

  return Array.from(results)
    .filter((path) => path.startsWith("jb2a."))
    .sort((a, b) => a.localeCompare(b));
}

function walkSequencerTree(node, prefix, results) {
  if (!node) return;

  if (Array.isArray(node)) {
    if (prefix) results.add(prefix);
    return;
  }

  if (typeof node !== "object") return;

  const keys = Object.keys(node);
  if (!keys.length && prefix) {
    results.add(prefix);
    return;
  }

  for (const key of keys) {
    const value = node[key];
    const next = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      results.add(next);
      continue;
    }

    if (value && typeof value === "object") {
      walkSequencerTree(value, next, results);
      continue;
    }

    results.add(next);
  }
}

function normalizeTargets(targets) {
  if (!targets) return [];
  if (Array.isArray(targets)) return targets.filter(Boolean);
  return [targets].filter(Boolean);
}

function resolveTargets(targets, options = {}) {
  const explicit = normalizeTargets(targets);
  if (explicit.length) return explicit;

  const fromOptions = normalizeTargets(options.targets);
  if (fromOptions.length) return fromOptions;

  return Array.from(game.user.targets ?? []).filter(Boolean);
}

async function playAnimationByName(actor, animationName, source, targets = [], options = {}) {
  const animations = await getActorAnimations(actor);
  const anim = animations.find((a) => a.name === animationName);

  if (!anim) {
    ui.notifications.warn(`Animation "${animationName}" not found on actor "${actor?.name ?? "Unknown"}".`);
    return false;
  }

  return playConfiguredAnimation(actor, anim, source, targets, options);
}

async function playAnimationByIndex(actor, index, source, targets = [], options = {}) {
  const animations = await getActorAnimations(actor);
  const anim = animations[index];

  if (!anim) {
    ui.notifications.warn(`Animation at index ${index} not found on actor "${actor?.name ?? "Unknown"}".`);
    return false;
  }

  return playConfiguredAnimation(actor, anim, source, targets, options);
}

async function playConfiguredAnimation(actor, anim, source, targets = [], options = {}) {
  if (!game.modules.get("sequencer")?.active) {
    ui.notifications.warn("Sequencer must be active to play animations.");
    return false;
  }

  if (!anim?.animation) {
    ui.notifications.warn("Animation path is empty.");
    return false;
  }

  if (!source) {
    ui.notifications.warn("A source token or placeable is required.");
    return false;
  }

  const resolvedTargets = resolveTargets(targets, options);
  const mode = String(anim.targetMode ?? DEFAULT_TARGET_MODE);

  switch (mode) {
    case "none": {
      const seq = new Sequence();
      const effect = seq.effect().file(anim.animation).atLocation(source);
      if (anim.persist) effect.persist();
      await seq.play();
      return true;
    }

    case "single": {
      if (!resolvedTargets.length) {
        ui.notifications.warn(`Animation "${anim.name}" requires at least one target.`);
        return false;
      }

      for (const target of resolvedTargets) {
        const seq = new Sequence();
        const effect = seq.effect().file(anim.animation).atLocation(source).stretchTo(target);
        if (anim.persist) effect.persist();
        await seq.play();
      }

      return true;
    }

    case "multi": {
      if (!resolvedTargets.length) {
        ui.notifications.warn(`Animation "${anim.name}" requires at least one target.`);
        return false;
      }

      const seq = new Sequence();
      for (const target of resolvedTargets) {
        const effect = seq.effect().file(anim.animation).atLocation(source).stretchTo(target);
        if (anim.persist) effect.persist();
      }

      await seq.play();
      return true;
    }

    case "chain": {
      if (!resolvedTargets.length) {
        ui.notifications.warn(`Animation "${anim.name}" requires at least one target.`);
        return false;
      }

      let previous = source;

      for (const target of resolvedTargets) {
        const seq = new Sequence();
        const effect = seq.effect().file(anim.animation).atLocation(previous).stretchTo(target);
        if (anim.persist) effect.persist();
        await seq.play();
        previous = target;
      }

      return true;
    }

    case "onTargets": {
      if (!resolvedTargets.length) {
        ui.notifications.warn(`Animation "${anim.name}" requires at least one target.`);
        return false;
      }

      const seq = new Sequence();
      for (const target of resolvedTargets) {
        const effect = seq.effect().file(anim.animation).attachTo(target);
        if (anim.persist) effect.persist();
      }

      await seq.play();
      return true;
    }

    default:
      ui.notifications.warn(`Unknown target mode "${mode}".`);
      return false;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}