const MODULE_ID = "actor-jb2a-animations";
const FLAG_KEY = "animations";
const TAB_KEY = "jb2a-animations";

Hooks.once("init", async () => {
  console.log(`${MODULE_ID} | Initializing`);
  await loadTemplates([`modules/${MODULE_ID}/templates/actor-tab.hbs`]);

  game.modules.get(MODULE_ID).api = {
    getActorAnimations,
    playAnimationByName,
    playAnimationByIndex,
    openPicker: renderAnimationPicker
  };
});

Hooks.once("ready", () => {
  globalThis.ActorJB2AAnimations = game.modules.get(MODULE_ID)?.api;
});

Hooks.on("renderActorSheet", async (app, html, data) => {
  try {
    const actor = app.actor;
    if (!actor?.isOwner) return;

    const root = html[0] ?? html;
    if (!(root instanceof HTMLElement)) return;
    if (root.querySelector(`[data-tab="${TAB_KEY}"]`)) return;

    const nav = root.querySelector("nav.sheet-tabs, .tabs[data-group='primary']");
    const body = root.querySelector(".sheet-body, .tab-body, section.sheet-body, .window-content form");
    if (!nav || !body) return;

    const navButton = document.createElement("a");
    navButton.classList.add("item");
    navButton.dataset.tab = TAB_KEY;
    navButton.dataset.group = "primary";
    navButton.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> ${game.i18n.localize(`${MODULE_ID}.tab.title`)}`;
    nav.appendChild(navButton);

    const animations = foundry.utils.deepClone(getActorAnimations(actor));
    const templateData = {
      moduleId: MODULE_ID,
      tabKey: TAB_KEY,
      animations,
      hasSequencer: game.modules.get("sequencer")?.active,
      hasJB2A: Array.from(game.modules.values()).some(m => m.active && m.id.toLowerCase().startsWith("jb2a"))
    };
    const tabHtml = await renderTemplate(`modules/${MODULE_ID}/templates/actor-tab.hbs`, templateData);

    const wrapper = document.createElement("div");
    wrapper.innerHTML = tabHtml;
    const tabElement = wrapper.firstElementChild;
    if (!tabElement) return;
    body.appendChild(tabElement);

    bindTabListeners(app, tabElement);

    if (app._tabs && Array.isArray(app._tabs)) {
      for (const tabController of app._tabs) {
        if (tabController.group === "primary") tabController.bind(root);
      }
    }
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to render actor tab`, err);
  }
});

function getActorAnimations(actor) {
  return actor.getFlag(MODULE_ID, FLAG_KEY) ?? [];
}

async function setActorAnimations(actor, animations) {
  return actor.setFlag(MODULE_ID, FLAG_KEY, animations);
}

function getJB2AOptions() {
  const flattened = globalThis.Sequencer?.Database?.flattenedEntries;
  if (!flattened || typeof flattened !== "object") return [];

  return Object.keys(flattened)
    .filter(key => key.startsWith("jb2a."))
    .sort((a, b) => a.localeCompare(b));
}

function bindTabListeners(app, tabElement) {
  const actor = app.actor;
  const list = tabElement.querySelector(`[data-animation-list]`);
  const addButton = tabElement.querySelector(`[data-action="add-animation"]`);
  const saveButton = tabElement.querySelector(`[data-action="save-animations"]`);

  addButton?.addEventListener("click", () => {
    list?.appendChild(createAnimationRow());
  });

  list?.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    const action = button.dataset.action;
    const row = button.closest(".aja-row");
    if (!row) return;

    if (action === "remove-row") {
      row.remove();
      return;
    }

    if (action === "browse-jb2a") {
      const currentValue = row.querySelector('[name="path"]')?.value ?? "";
      const selected = await renderAnimationPicker(currentValue);
      if (selected) {
        const input = row.querySelector('[name="path"]');
        if (input) input.value = selected;
      }
    }
  });

  saveButton?.addEventListener("click", async () => {
    const animations = collectAnimations(tabElement);
    await setActorAnimations(actor, animations);
    ui.notifications.info(game.i18n.localize(`${MODULE_ID}.notifications.saved`));
    app.render(false);
  });
}

function collectAnimations(tabElement) {
  const rows = Array.from(tabElement.querySelectorAll(".aja-row"));
  return rows.map((row, index) => ({
    id: row.dataset.id || foundry.utils.randomID(),
    sort: index,
    name: row.querySelector('[name="name"]')?.value?.trim() || `Animation ${index + 1}`,
    hasTarget: row.querySelector('[name="hasTarget"]')?.checked ?? false,
    path: row.querySelector('[name="path"]')?.value?.trim() || ""
  })).filter(entry => entry.path);
}

function createAnimationRow(animation = {}) {
  const row = document.createElement("div");
  row.className = "aja-row";
  row.dataset.id = animation.id || foundry.utils.randomID();
  row.innerHTML = `
    <div class="aja-cell aja-name">
      <input type="text" name="name" value="${escapeHtml(animation.name ?? "")}" placeholder="${escapeHtml(game.i18n.localize(`${MODULE_ID}.fields.name.placeholder`))}">
    </div>
    <label class="aja-cell aja-target checkbox">
      <input type="checkbox" name="hasTarget" ${animation.hasTarget ? "checked" : ""}>
      <span>${escapeHtml(game.i18n.localize(`${MODULE_ID}.fields.hasTarget.label`))}</span>
    </label>
    <div class="aja-cell aja-path">
      <input type="text" name="path" value="${escapeHtml(animation.path ?? "")}" placeholder="jb2a.magic_missile.blue">
      <button type="button" class="icon" data-action="browse-jb2a" title="${escapeHtml(game.i18n.localize(`${MODULE_ID}.actions.pick`))}">
        <i class="fa-solid fa-folder-tree"></i>
      </button>
    </div>
    <div class="aja-cell aja-actions">
      <button type="button" class="icon danger" data-action="remove-row" title="${escapeHtml(game.i18n.localize(`${MODULE_ID}.actions.remove`))}">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
  `;
  return row;
}

async function renderAnimationPicker(currentValue = "") {
  const options = getJB2AOptions();
  if (!options.length) {
    ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.notifications.noDatabase`));
    return null;
  }

  return await new Promise(resolve => {
    const rows = options.map(path => {
      const selected = path === currentValue ? "selected" : "";
      return `<option value="${escapeHtml(path)}" ${selected}>${escapeHtml(path)}</option>`;
    }).join("");

    const content = `
      <div class="aja-picker">
        <p>${escapeHtml(game.i18n.localize(`${MODULE_ID}.picker.hint`))}</p>
        <input type="text" name="aja-filter" placeholder="jb2a.magic_missile">
        <select name="aja-path" size="16">${rows}</select>
      </div>
    `;

    const dialog = new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize(`${MODULE_ID}.picker.title`) },
      content,
      buttons: [
        {
          action: "ok",
          label: game.i18n.localize("Confirm"),
          default: true,
          callback: (event, button, dialogInstance) => {
            const value = dialogInstance.element.querySelector('[name="aja-path"]')?.value || null;
            resolve(value);
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("Cancel"),
          callback: () => resolve(null)
        }
      ],
      render: (event, dialogInstance) => {
        const element = dialogInstance.element;
        const filterInput = element.querySelector('[name="aja-filter"]');
        const select = element.querySelector('[name="aja-path"]');

        const refresh = () => {
          const filter = filterInput.value.trim().toLowerCase();
          const renderedOptions = options
            .filter(path => !filter || path.toLowerCase().includes(filter))
            .map(path => `<option value="${escapeHtml(path)}" ${path === currentValue ? "selected" : ""}>${escapeHtml(path)}</option>`)
            .join("");
          select.innerHTML = renderedOptions;
        };

        filterInput.addEventListener("input", refresh);
        select.addEventListener("dblclick", () => {
          resolve(select.value || null);
          dialogInstance.close();
        });
      },
      close: () => resolve(null)
    });

    dialog.render(true);
  });
}

async function playAnimationByName(actorRef, animationName, sourceRef = null, targetRef = null, options = {}) {
  const actor = resolveActor(actorRef);
  if (!actor) throw new Error("Actor not found");

  const animations = getActorAnimations(actor);
  const animation = animations.find(a => a.name === animationName);
  if (!animation) throw new Error(`Animation '${animationName}' not found on actor '${actor.name}'`);

  return playAnimation(actor, animation, sourceRef, targetRef, options);
}

async function playAnimationByIndex(actorRef, index, sourceRef = null, targetRef = null, options = {}) {
  const actor = resolveActor(actorRef);
  if (!actor) throw new Error("Actor not found");

  const animations = getActorAnimations(actor);
  const animation = animations[index];
  if (!animation) throw new Error(`Animation index '${index}' not found on actor '${actor.name}'`);

  return playAnimation(actor, animation, sourceRef, targetRef, options);
}

async function playAnimation(actor, animation, sourceRef = null, targetRef = null, options = {}) {
  if (!game.modules.get("sequencer")?.active || !globalThis.Sequence) {
    throw new Error("Sequencer module is not active");
  }

  if (!animation?.path) {
    throw new Error("Animation path is empty");
  }

  const source = resolvePlaceable(sourceRef) || actor.getActiveTokens()[0] || null;
  const target = resolvePlaceable(targetRef) || null;

  if (!source && !options.at) {
    throw new Error("No source token/location provided");
  }

  if (animation.hasTarget && !target && !options.to) {
    throw new Error(`Animation '${animation.name}' requires a target`);
  }

  const sequence = new Sequence({ moduleName: MODULE_ID, softFail: true });
  const effect = sequence.effect().file(animation.path);

  if (options.scale != null) effect.scale(options.scale);
  if (options.belowTokens != null) effect.belowTokens(options.belowTokens);
  if (options.opacity != null) effect.opacity(options.opacity);
  if (options.waitUntilFinished != null) effect.waitUntilFinished(options.waitUntilFinished);

  if (options.at) effect.atLocation(options.at);
  else effect.atLocation(source);

  if (animation.hasTarget) {
    effect.stretchTo(options.to ?? target, options.stretchOptions ?? {});
  }

  await sequence.play(options.playOptions ?? {});
  return true;
}

function resolveActor(actorRef) {
  if (!actorRef) return null;
  if (actorRef instanceof Actor) return actorRef;
  if (typeof actorRef === "string") return game.actors.get(actorRef) || game.actors.getName(actorRef) || null;
  if (actorRef.actor instanceof Actor) return actorRef.actor;
  return null;
}

function resolvePlaceable(ref) {
  if (!ref) return null;
  if (ref.object) return ref.object;
  if (typeof Token !== "undefined" && ref instanceof Token) return ref;
  if (typeof TokenDocument !== "undefined" && ref instanceof TokenDocument) return ref.object ?? null;
  if (typeof ref === "string") {
    return canvas.tokens?.get(ref) ?? canvas.tokens?.placeables?.find(t => t.name === ref) ?? null;
  }
  return ref;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
