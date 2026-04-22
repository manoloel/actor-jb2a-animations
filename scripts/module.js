const MODULE_ID = "actor-jb2a-animations";
const FLAG_SCOPE = MODULE_ID;
const FLAG_KEY = "animations";
const TAB_ID = `${MODULE_ID}-tab`;
const DEFAULT_TARGET_MODE = "none";

const TARGET_MODE_OPTIONS = [
  { value: "none", label: "No target" },
  { value: "single", label: "Single target" },
  { value: "multi", label: "Multiple targets" },
  { value: "chain", label: "Chain" },
  { value: "onTargets", label: "On targets" }
];

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing`);

  game.modules.get(MODULE_ID).api = {
    getActorAnimations,
    setActorAnimations,
    playAnimationByName,
    playAnimationByIndex,
    playConfiguredAnimation
  };

  globalThis.ActorJB2AAnimations = game.modules.get(MODULE_ID).api;
});

Hooks.on("renderActorSheet", async (app, html, data) => {
  try {
    const actor = app.actor;
    if (!actor?.isOwner) return;

    const root = html[0];
    if (!root) return;

    if (root.querySelector(`[data-tab="${TAB_ID}"]`)) return;

    const tabsNav = findTabsNav(root);
    const tabContentContainer = findTabContentContainer(root);

    if (!tabsNav || !tabContentContainer) return;

    insertTabButton(tabsNav);
    insertTabContent(tabContentContainer, actor);

    activateTabHandlers(root, app, actor);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to render actor tab`, err);
  }
});

async function getActorAnimations(actor) {
  if (!actor) return [];
  const raw = foundry.utils.deepClone(actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? []);
  return raw.map(normalizeAnimationData);
}

async function setActorAnimations(actor, animations) {
  if (!actor) return;
  const cleaned = (animations ?? []).map(normalizeAnimationData);
  await actor.setFlag(FLAG_SCOPE, FLAG_KEY, cleaned);
}

function normalizeAnimationData(anim = {}) {
  return {
    id: anim.id ?? foundry.utils.randomID(),
    name: String(anim.name ?? "").trim(),
    animation: String(anim.animation ?? "").trim(),
    targetMode: String(anim.targetMode ?? DEFAULT_TARGET_MODE),
    persist: Boolean(anim.persist)
  };
}

function findTabsNav(root) {
  return (
    root.querySelector('nav.sheet-tabs.tabs[data-group="primary"]') ||
    root.querySelector('nav.tabs[data-group="primary"]') ||
    root.querySelector(".sheet-tabs")
  );
}

function findTabContentContainer(root) {
  return (
    root.querySelector(".sheet-body") ||
    root.querySelector(".tab-body") ||
    root.querySelector(".window-content form") ||
    root.querySelector("form")
  );
}

function insertTabButton(tabsNav) {
  const a = document.createElement("a");
  a.classList.add("item");
  a.dataset.tab = TAB_ID;
  a.dataset.group = "primary";
  a.innerHTML = `<i class="fas fa-film"></i> Animations`;
  tabsNav.appendChild(a);
}

function insertTabContent(container, actor) {
  const tab = document.createElement("section");
  tab.classList.add("tab");
  tab.dataset.tab = TAB_ID;
  tab.dataset.group = "primary";
  tab.innerHTML = buildTabHtml(actor);
  container.appendChild(tab);
}

function activateTabHandlers(root, app, actor) {
  const tab = root.querySelector(`[data-tab="${TAB_ID}"]`);
  if (!tab) return;

  tab.querySelector('[data-action="add-animation"]')?.addEventListener("click", async (event) => {
    event.preventDefault();
    const animations = await getActorAnimations(actor);
    animations.push(normalizeAnimationData({}));
    await setActorAnimations(actor, animations);
    app.render(true);
  });

  tab.querySelectorAll('[data-action="remove-animation"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const index = Number(button.dataset.index);
      const animations = await getActorAnimations(actor);
      animations.splice(index, 1);
      await setActorAnimations(actor, animations);
      app.render(true);
    });
  });

  tab.querySelectorAll('[data-action="pick-animation"]').forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const index = Number(button.dataset.index);
      await openSequencerPicker(actor, index, app);
    });
  });

  tab.querySelectorAll("input, select").forEach((field) => {
    field.addEventListener("change", async () => {
      await saveFormToActor(tab, actor);
    });
  });
}

async function saveFormToActor(tab, actor) {
  const rows = Array.from(tab.querySelectorAll(".jb2a-animation-row"));

  const animations = rows.map((row) =>
    normalizeAnimationData({
      id: row.dataset.id || foundry.utils.randomID(),
      name: row.querySelector('[name="name"]')?.value ?? "",
      animation: row.querySelector('[name="animation"]')?.value ?? "",
      targetMode: row.querySelector('[name="targetMode"]')?.value ?? DEFAULT_TARGET_MODE,
      persist: row.querySelector('[name="persist"]')?.checked ?? false
    })
  );

  await setActorAnimations(actor, animations);
}

function buildTabHtml(actor) {
  const animations = actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? [];

  const rows = animations.map((anim, index) => {
    const normalized = normalizeAnimationData(anim);

    return `
      <div class="jb2a-animation-row" data-id="${escapeHtml(normalized.id)}" style="border: 1px solid var(--color-border-light-primary); border-radius: 6px; padding: 10px; margin-bottom: 10px;">
        <div class="form-group">
          <label>Name</label>
          <input type="text" name="name" value="${escapeHtml(normalized.name)}" placeholder="Magic Missile">
        </div>

        <div class="form-group">
          <label>Animation</label>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="text" name="animation" value="${escapeHtml(normalized.animation)}" placeholder="jb2a.magic_missile.blue" style="flex: 1;">
            <button type="button" data-action="pick-animation" data-index="${index}">
              Pick
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>Target mode</label>
          <select name="targetMode">
            ${TARGET_MODE_OPTIONS.map((opt) => {
              const selected = normalized.targetMode === opt.value ? "selected" : "";
              return `<option value="${escapeHtml(opt.value)}" ${selected}>${escapeHtml(opt.label)}</option>`;
            }).join("")}
          </select>
        </div>

        <div class="form-group">
          <label>Persist</label>
          <input type="checkbox" name="persist" ${normalized.persist ? "checked" : ""}>
        </div>

        <div class="form-group">
          <button type="button" data-action="remove-animation" data-index="${index}">
            Remove
          </button>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="jb2a-animations-tab" style="padding: 10px; overflow-y: auto;">
      <header style="margin-bottom: 10px;">
        <p>Configure JB2A / Sequencer animations for this actor.</p>
      </header>

      <div class="jb2a-animations-list">
        ${rows || `<p>No animations configured yet.</p>`}
      </div>

      <div>
        <button type="button" data-action="add-animation">
          Add animation
        </button>
      </div>
    </div>
  `;
}

async function openSequencerPicker(actor, index, app) {
  if (!game.modules.get("sequencer")?.active) {
    ui.notifications.warn("Sequencer must be active to use the picker.");
    return;
  }

  const db = globalThis.Sequencer?.Database;
  if (!db) {
    ui.notifications.warn("Sequencer database is not available.");
    return;
  }

  const entries = collectSequencerEntries();
  if (!entries.length) {
    ui.notifications.warn("No Sequencer database entries were found.");
    return;
  }

  const content = `
    <form>
      <div class="form-group">
        <label>Animation</label>
        <select name="animation" style="width: 100%;">
          ${entries.map((entry) => `<option value="${escapeHtml(entry)}">${escapeHtml(entry)}</option>`).join("")}
        </select>
      </div>
    </form>
  `;

  new Dialog({
    title: "Pick JB2A Animation",
    content,
    buttons: {
      ok: {
        label: "Select",
        callback: async (html) => {
          const value = html.find('[name="animation"]').val();
          const animations = await getActorAnimations(actor);
          if (!animations[index]) return;
          animations[index].animation = value;
          await setActorAnimations(actor, animations);
          app.render(true);
        }
      },
      cancel: {
        label: "Cancel"
      }
    },
    default: "ok"
  }).render(true);
}

function collectSequencerEntries() {
  const results = new Set();

  const root = globalThis.Sequencer?.Database?.entries;
  if (root) walkSequencerTree(root, "", results);

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

    if (typeof value === "object" && value) {
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
  const mode = anim.targetMode ?? DEFAULT_TARGET_MODE;

  switch (mode) {
    case "none": {
      const seq = new Sequence().effect().file(anim.animation).atLocation(source);
      if (anim.persist) seq.persist();
      await seq.play();
      return true;
    }

    case "single": {
      const target = resolvedTargets[0];
      if (!target) {
        ui.notifications.warn(`Animation "${anim.name}" requires one target.`);
        return false;
      }

      const seq = new Sequence().effect().file(anim.animation).atLocation(source).stretchTo(target);
      if (anim.persist) seq.persist();
      await seq.play();
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

      const seq = new Sequence();
      let previous = source;

      for (const target of resolvedTargets) {
        const effect = seq.effect().file(anim.animation).atLocation(previous).stretchTo(target);
        if (anim.persist) effect.persist();
        previous = target;
      }

      await seq.play();
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