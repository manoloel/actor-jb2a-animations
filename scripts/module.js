const MODULE_ID = "actor-jb2a-animations";
const FLAG_SCOPE = MODULE_ID;
const FLAG_KEY = "animations";
const TAB_ID = `${MODULE_ID}-tab`;
const TAB_BUTTON_ID = `${MODULE_ID}-tab-button`;
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

  const api = {
    getActorAnimations,
    setActorAnimations,
    playAnimationByName,
    playAnimationByIndex,
    playConfiguredAnimation
  };

  game.modules.get(MODULE_ID).api = api;
  globalThis.ActorJB2AAnimations = api;
});

Hooks.on("renderActorSheet", (app, html) => {
  queueSheetEnhancement(app, html);
});

for (const hookName of [
  "renderActorSheet5eCharacter",
  "renderActorSheet5eNPC",
  "renderActorSheet5eVehicle",
  "renderActorSheet5eGroup",
  "renderTidy5eSheet"
]) {
  Hooks.on(hookName, (app, html) => {
    queueSheetEnhancement(app, html);
  });
}

function queueSheetEnhancement(app, html) {
  // Let the sheet finish its own DOM work first.
  requestAnimationFrame(() => {
    setTimeout(() => {
      tryEnhanceSheet(app, html);
    }, 0);
  });
}

async function tryEnhanceSheet(app, html) {
  try {
    const actor = app?.actor;
    if (!actor?.isOwner) return;

    const root = getRootElement(html, app);
    if (!root) return;

    const shell = findSheetShell(root);
    if (!shell) return;

    if (shell.querySelector(`#${TAB_BUTTON_ID}`) || shell.querySelector(`[data-tab="${TAB_ID}"]`)) return;

    const tabsNav = findTabsNav(shell);
    const contentContainer = findContentContainer(shell);

    if (!tabsNav || !contentContainer) {
      console.warn(`${MODULE_ID} | Could not find tab nav/content container`, { app, root, shell });
      return;
    }

    insertTabButton(tabsNav);
    await insertTabPanel(contentContainer, actor);
    bindSheetHandlers(shell, app, actor);
    wireTabSwitching(shell, tabsNav, contentContainer);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to enhance actor sheet`, err);
  }
}

function getRootElement(html, app) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (app?.element?.[0] instanceof HTMLElement) return app.element[0];
  if (app?.element instanceof HTMLElement) return app.element;
  return null;
}

function findSheetShell(root) {
  return (
    root.closest?.(".application") ||
    root.querySelector?.(".window-content") ||
    root
  );
}

function findTabsNav(root) {
  const candidates = [
    'nav[role="tablist"]',
    'nav.sheet-tabs',
    'nav.tabs',
    '.sheet-navigation',
    '.sheet-tabs',
    '[data-group="primary"]',
    '[role="tablist"]'
  ];

  for (const selector of candidates) {
    const el = root.querySelector(selector);
    if (el) return el;
  }

  return null;
}

function findContentContainer(root) {
  const selectors = [
    '[data-application-part="body"]',
    '.sheet-body',
    '.tab-body',
    '.window-content form',
    'form'
  ];

  for (const selector of selectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }

  return null;
}

function insertTabButton(tabsNav) {
  const button = document.createElement("a");
  button.id = TAB_BUTTON_ID;
  button.classList.add("item");
  button.dataset.tab = TAB_ID;
  button.dataset.group = "primary";
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", "false");
  button.href = "#";
  button.innerHTML = `<i class="fas fa-film"></i> Animations`;
  tabsNav.appendChild(button);
}

async function insertTabPanel(container, actor) {
  const panel = document.createElement("section");
  panel.classList.add("tab");
  panel.dataset.tab = TAB_ID;
  panel.dataset.group = "primary";
  panel.dataset.moduleTab = MODULE_ID;
  panel.style.display = "none";
  panel.innerHTML = buildTabHtml(await getActorAnimations(actor));
  container.appendChild(panel);
}

function wireTabSwitching(root, tabsNav, contentContainer) {
  const ourButton = root.querySelector(`#${TAB_BUTTON_ID}`);
  const ourPanel = root.querySelector(`[data-tab="${TAB_ID}"]`);
  if (!ourButton || !ourPanel) return;

  const tabButtons = Array.from(
    tabsNav.querySelectorAll('[data-tab], [role="tab"]')
  );

  ourButton.addEventListener("click", (event) => {
    event.preventDefault();

    for (const btn of tabButtons) {
      btn.classList.remove("active");
      btn.setAttribute("aria-selected", "false");
    }

    const allPanels = Array.from(contentContainer.querySelectorAll(".tab, [data-tab]"));
    for (const panel of allPanels) {
      if (panel === ourPanel) continue;
      panel.classList.remove("active");
      panel.style.display = "none";
      panel.hidden = true;
    }

    ourButton.classList.add("active");
    ourButton.setAttribute("aria-selected", "true");
    ourPanel.classList.add("active");
    ourPanel.style.display = "";
    ourPanel.hidden = false;
  });

  for (const btn of tabButtons) {
    if (btn === ourButton) continue;
    btn.addEventListener("click", () => {
      ourButton.classList.remove("active");
      ourButton.setAttribute("aria-selected", "false");
      ourPanel.classList.remove("active");
      ourPanel.style.display = "none";
      ourPanel.hidden = true;
    });
  }
}

function bindSheetHandlers(root, app, actor) {
  const panel = root.querySelector(`[data-tab="${TAB_ID}"]`);
  if (!panel) return;

  panel.addEventListener("click", async (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;

    event.preventDefault();
    const action = actionEl.dataset.action;

    if (action === "add-animation") {
      const animations = await getActorAnimations(actor);
      animations.push(normalizeAnimationData({}));
      await setActorAnimations(actor, animations);
      await rerenderPanel(panel, actor);
      return;
    }

    if (action === "remove-animation") {
      const index = Number(actionEl.dataset.index);
      const animations = await getActorAnimations(actor);
      animations.splice(index, 1);
      await setActorAnimations(actor, animations);
      await rerenderPanel(panel, actor);
      return;
    }

    if (action === "pick-animation") {
      const index = Number(actionEl.dataset.index);
      await openSequencerPicker(actor, index, app, panel);
      return;
    }
  });

  panel.addEventListener("change", async (event) => {
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
    await savePanelToActor(panel, actor);
  });
}

async function rerenderPanel(panel, actor) {
  panel.innerHTML = buildTabHtml(await getActorAnimations(actor));
}

async function getActorAnimations(actor) {
  if (!actor) return [];
  const raw = foundry.utils.deepClone(actor.getFlag(FLAG_SCOPE, FLAG_KEY) ?? []);
  return raw.map(normalizeAnimationData);
}

async function setActorAnimations(actor, animations) {
  if (!actor) return;
  await actor.setFlag(FLAG_SCOPE, FLAG_KEY, (animations ?? []).map(normalizeAnimationData));
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

async function savePanelToActor(panel, actor) {
  const rows = Array.from(panel.querySelectorAll(".jb2a-animation-row"));

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

function buildTabHtml(animations) {
  const rows = animations.map((anim, index) => {
    return `
      <div class="jb2a-animation-row" data-id="${escapeHtml(anim.id)}" style="border: 1px solid var(--color-border-light-primary, #999); border-radius: 6px; padding: 10px; margin-bottom: 10px;">
        <div class="form-group">
          <label>Name</label>
          <input type="text" name="name" value="${escapeHtml(anim.name)}" placeholder="Magic Missile">
        </div>

        <div class="form-group">
          <label>Animation</label>
          <div style="display:flex; gap:6px; align-items:center;">
            <input type="text" name="animation" value="${escapeHtml(anim.animation)}" placeholder="jb2a.magic_missile.blue" style="flex:1;">
            <button type="button" data-action="pick-animation" data-index="${index}">Pick</button>
          </div>
        </div>

        <div class="form-group">
          <label>Target mode</label>
          <select name="targetMode">
            ${TARGET_MODE_OPTIONS.map((opt) => `
              <option value="${escapeHtml(opt.value)}" ${anim.targetMode === opt.value ? "selected" : ""}>
                ${escapeHtml(opt.label)}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="form-group">
          <label>Persist</label>
          <input type="checkbox" name="persist" ${anim.persist ? "checked" : ""}>
        </div>

        <div class="form-group">
          <button type="button" data-action="remove-animation" data-index="${index}">Remove</button>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="jb2a-animations-tab" style="padding:10px; overflow:auto;">
      <header style="margin-bottom:10px;">
        <p>Configure JB2A and Sequencer animations for this actor.</p>
      </header>

      <div class="jb2a-animations-list">
        ${rows || `<p>No animations configured yet.</p>`}
      </div>

      <div>
        <button type="button" data-action="add-animation">Add animation</button>
      </div>
    </div>
  `;
}

async function openSequencerPicker(actor, index, app, panel) {
  if (!game.modules.get("sequencer")?.active) {
    ui.notifications.warn("Sequencer must be active to use the picker.");
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
        <select name="animation" style="width:100%;">
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
          await rerenderPanel(panel, actor);
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

  const db = globalThis.Sequencer?.Database;
  if (!db) return [];

  const entriesRoot =
    db.entries ||
    db._entries ||
    db.database ||
    null;

  if (entriesRoot) {
    walkSequencerTree(entriesRoot, "", results);
  }

  // Fallback for environments where the DB exposes search helpers but not raw entries.
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

  const optionTargets = normalizeTargets(options.targets);
  if (optionTargets.length) return optionTargets;

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
      const target = resolvedTargets[0];
      if (!target) {
        ui.notifications.warn(`Animation "${anim.name}" requires one target.`);
        return false;
      }

      const seq = new Sequence();
      const effect = seq.effect().file(anim.animation).atLocation(source).stretchTo(target);
      if (anim.persist) effect.persist();
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