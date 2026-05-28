/**
 * GrandLodgeApp — Ventana principal del hub.
 * Usa ApplicationV2 + HandlebarsApplicationMixin (v13 estándar).
 */

import { MissionData } from "./mission-data.mjs";
import { AgentUtils }  from "./agent-utils.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const MODULE_ID = "grand-lodge-hub";

export class GrandLodgeApp extends HandlebarsApplicationMixin(ApplicationV2) {

  // ── Configuración estática ────────────────────────────────────────────────

  static DEFAULT_OPTIONS = {
    id: "grand-lodge-hub",
    classes: ["grand-lodge"],
    window: {
      title: "Grand Lodge — Tablero de Operaciones",
      icon: "fa-solid fa-scroll",
      resizable: true,
      controls: [
        {
          icon: "fa-solid fa-book-open",
          label: "Añadir entrada a la Crónica",
          action: "addChronicle",
        },
      ],
    },
    position: {
      width: 860,
      height: 680,
    },
    actions: {
      switchTab:            GrandLodgeApp.switchTab,
      openMission:          GrandLodgeApp.openMission,
      filterMissions:       GrandLodgeApp.filterMissions,
      cycleAgent:           GrandLodgeApp.cycleAgent,
      addChronicle:         GrandLodgeApp.addChronicle,
      openActorSheet:       GrandLodgeApp.openActorSheet,
      addMission:           GrandLodgeApp.addMission,
      editMission:          GrandLodgeApp.editMission,
      deleteMission:        GrandLodgeApp.deleteMission,
      removeShopItem:       GrandLodgeApp.removeShopItem,
      takeShopItem:         GrandLodgeApp.takeShopItem,
      buyMarketItem:        GrandLodgeApp.buyMarketItem,
      removeMarketListing:  GrandLodgeApp.removeMarketListing,
      viewShopItem:           GrandLodgeApp.viewShopItem,
      viewMarketItem:         GrandLodgeApp.viewMarketItem,
      toggleAgentVisibility:  GrandLodgeApp.toggleAgentVisibility,
      deleteChronicle:        GrandLodgeApp.deleteChronicle,
    },
  };

  static PARTS = {
    tabs:      { template: "modules/grand-lodge-hub/templates/tabs.hbs" },
    missions:  { template: "modules/grand-lodge-hub/templates/missions.hbs" },
    agents:    { template: "modules/grand-lodge-hub/templates/agents.hbs" },
    shop:      { template: "modules/grand-lodge-hub/templates/shop.hbs" },
    chronicle: { template: "modules/grand-lodge-hub/templates/chronicle.hbs" },
  };

  // ── Estado interno ────────────────────────────────────────────────────────

  _activeTab       = "missions";
  _missionFilter   = "all";
  _selectedActorId = null;

  // ── Contexto para plantillas ──────────────────────────────────────────────

  async _prepareContext(options) {
    const missions      = game.settings.get(MODULE_ID, "missions");
    const agentStatus   = game.settings.get(MODULE_ID, "agentStatus");
    const chronicle     = game.settings.get(MODULE_ID, "chronicle");
    const shopItems     = game.settings.get(MODULE_ID, "shopItems");
    const marketplace   = game.settings.get(MODULE_ID, "marketplace");
    const hiddenAgents  = game.settings.get(MODULE_ID, "hiddenAgents");
    const allActors     = AgentUtils.getAgents(agentStatus);

    const filtered = this._missionFilter === "all"
      ? missions
      : missions.filter(m => m.type === this._missionFilter);

    // GM sees all agents with hidden flag; players see only visible agents
    const actors = game.user.isGM
      ? allActors.map(a => ({ ...a, hidden: !!hiddenAgents[a.actorId] }))
      : allActors.filter(a => !hiddenAgents[a.actorId]);

    const ownedAgents = allActors.filter(a => game.user.isGM || game.actors.get(a.actorId)?.isOwner);

    const enrichedShop = shopItems.map(i => ({
      ...i,
      priceLabel: GrandLodgeApp._priceLabel(i.price),
    }));

    const enrichedMarket = marketplace.map(l => ({
      ...l,
      priceLabel: GrandLodgeApp._priceLabel(l.price),
      canRemove:  game.user.isGM || !!game.actors.get(l.actorId)?.isOwner,
      isMine:     !!game.actors.get(l.actorId)?.isOwner,
    }));

    return {
      activeTab:     this._activeTab,
      missionFilter: this._missionFilter,
      missions:      filtered,
      allMissions:   missions,
      agents:        actors,
      ownedAgents:   ownedAgents,
      chronicle:     [...chronicle].reverse(),
      shopItems:     enrichedShop,
      marketplace:   enrichedMarket,
      isGM:          game.user.isGM,
      tabs: [
        { id: "missions",  label: "Misiones",    icon: "fa-scroll" },
        { id: "agents",    label: "Agentes",     icon: "fa-sword" },
        { id: "shop",      label: "Provisiones", icon: "fa-store" },
        { id: "chronicle", label: "Crónica",     icon: "fa-book-open" },
      ],
      showMissions:  this._activeTab === "missions",
      showAgents:    this._activeTab === "agents",
      showShop:      this._activeTab === "shop",
      showChronicle: this._activeTab === "chronicle",
    };
  }

  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = ["tabs", "missions", "agents", "shop", "chronicle"];
  }

  // ── Render: drag & drop y selector de actor ───────────────────────────────

  _onRender(context, options) {
    super._onRender(context, options);

    const attachDropzone = (id, handler) => {
      const el = this.element.querySelector(id);
      if (!el) return;
      el.addEventListener("dragover",  e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; el.classList.add("dragover"); });
      el.addEventListener("dragleave", () => el.classList.remove("dragover"));
      el.addEventListener("drop",      e => { e.preventDefault(); el.classList.remove("dragover"); handler(e); });
    };

    attachDropzone("#shop-dropzone",   e => this._onDropShopItem(e));
    attachDropzone("#market-dropzone", e => this._onDropMarketItem(e));

    // Restaurar selección del actor
    const select = this.element.querySelector("#shop-actor-select");
    if (select) {
      if (this._selectedActorId) select.value = this._selectedActorId;
      select.addEventListener("change", () => { this._selectedActorId = select.value; });
    }
  }

  // ── Utilidades de precio ──────────────────────────────────────────────────

  static _toCp(price) {
    if (!price) return 0;
    if (typeof price === "string") {
      const n = parseFloat(price) || 0;
      const s = price.toLowerCase();
      if (s.includes("pp")) return Math.round(n * 1000);
      if (s.includes("pl") || s.includes("sp")) return Math.round(n * 10);
      if (s.includes("pc") || s.includes("cp")) return Math.round(n);
      return Math.round(n * 100);
    }
    return (price.pp||0)*1000 + (price.gp||0)*100 + (price.sp||0)*10 + (price.cp||0);
  }

  static _fromCp(cp) {
    const pp = Math.floor(cp / 1000); cp %= 1000;
    const gp = Math.floor(cp / 100);  cp %= 100;
    const sp = Math.floor(cp / 10);   cp %= 10;
    return { pp, gp, sp, cp };
  }

  static _priceLabel(price) {
    if (!price) return "Gratis";
    if (typeof price === "string") return price || "Gratis";
    const parts = [];
    if (price.pp) parts.push(`${price.pp} pp`);
    if (price.gp) parts.push(`${price.gp} po`);
    if (price.sp) parts.push(`${price.sp} pl`);
    if (price.cp) parts.push(`${price.cp} pc`);
    return parts.length ? parts.join(" + ") : "Gratis";
  }

  // Verifica que haya un GM conectado para procesar mensajes socket
  // Devuelve true si puede proceder (es GM, o hay GM activo)
  static _requireGM() {
    if (game.user.isGM) return true;
    const gm = game.users.activeGM ?? game.users.find(u => u.isGM && u.active);
    if (!gm) {
      ui.notifications.warn("Necesitas un GM conectado para realizar esta acción.");
      return false;
    }
    return true;
  }

  // Emite un mensaje socket con log de diagnóstico
  static _emit(payload) {
    console.log(`${MODULE_ID} | socket emit:`, payload?.type, payload);
    game.socket.emit(`module.${MODULE_ID}`, payload);
  }

  static _toCoinsObj(price) {
    if (typeof price === "string") {
      return GrandLodgeApp._fromCp(GrandLodgeApp._toCp(price));
    }
    return { pp: price?.pp||0, gp: price?.gp||0, sp: price?.sp||0, cp: price?.cp||0 };
  }

  // Devuelve el valor total en cobre del actor, usando inventory API de PF2e con fallback
  static _actorCopperValue(actor) {
    if (actor.inventory?.coins?.copperValue !== undefined)
      return actor.inventory.coins.copperValue;
    const c = actor.system?.coins ?? {};
    return (c.pp||0)*1000 + (c.gp||0)*100 + (c.sp||0)*10 + (c.cp||0);
  }

  // Devuelve la representación de monedas del actor como string
  static _actorCoinsLabel(actor) {
    if (actor.inventory?.coins?.toString)
      return actor.inventory.coins.toString();
    const c = actor.system?.coins ?? {};
    return GrandLodgeApp._priceLabel(c);
  }

  // Descuenta monedas del actor usando inventory API de PF2e con fallback
  static async _actorRemoveCoins(actor, coinsObj) {
    if (typeof actor.inventory?.removeCoins === "function")
      return actor.inventory.removeCoins(coinsObj);
    // Fallback: actualizar system.coins directamente
    const c     = actor.system?.coins ?? {};
    const total = (c.pp||0)*1000 + (c.gp||0)*100 + (c.sp||0)*10 + (c.cp||0);
    const cost  = GrandLodgeApp._toCp(coinsObj);
    if (total < cost) return false;
    const nc = GrandLodgeApp._fromCp(total - cost);
    await actor.update({ "system.coins.pp": nc.pp, "system.coins.gp": nc.gp,
                         "system.coins.sp": nc.sp, "system.coins.cp": nc.cp });
    return true;
  }

  // Añade monedas al actor usando inventory API de PF2e con fallback
  static async _actorAddCoins(actor, coinsObj) {
    if (typeof actor.inventory?.addCoins === "function")
      return actor.inventory.addCoins(coinsObj);
    const c   = actor.system?.coins ?? {};
    const nc  = GrandLodgeApp._fromCp(
      (c.pp||0)*1000 + (c.gp||0)*100 + (c.sp||0)*10 + (c.cp||0) + GrandLodgeApp._toCp(coinsObj)
    );
    await actor.update({ "system.coins.pp": nc.pp, "system.coins.gp": nc.gp,
                         "system.coins.sp": nc.sp, "system.coins.cp": nc.cp });
  }

  static _priceInput(defaultGp = 0) {
    return `<div style="display:flex;gap:6px;align-items:center">
      <input type="number" name="price-amount" value="${defaultGp}" min="0" style="flex:1;min-width:0">
      <select name="price-denom" style="width:100px">
        <option value="gp" selected>po (oro)</option>
        <option value="pp">pp (platino)</option>
        <option value="sp">pl (plata)</option>
        <option value="cp">pc (cobre)</option>
      </select>
    </div>`;
  }

  static _readPriceForm(form) {
    const amount = parseFloat(form.querySelector("[name=price-amount]").value) || 0;
    const denom  = form.querySelector("[name=price-denom]").value;
    const price  = { pp: 0, gp: 0, sp: 0, cp: 0 };
    price[denom] = amount;
    return price;
  }

  // ── Drop de item en la tienda (solo GM) ───────────────────────────────────

  async _onDropShopItem(event) {
    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); }
    catch { return; }
    if (data.type !== "Item" || !data.uuid) return;

    const item = await fromUuid(data.uuid);
    if (!item) { ui.notifications.warn("No se pudo encontrar el item."); return; }

    const defaultGp = item.system?.price?.value?.gp ?? 0;

    new foundry.applications.api.DialogV2({
      window: { title: "Agregar a la tienda", icon: "fa-store" },
      content: `
        <form class="standard-form" style="padding:8px">
          <p style="margin:0 0 12px 0">Agregando: <strong>${item.name}</strong></p>

          <div class="form-group" style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px">
            <label><strong>Cantidad en stock</strong></label>
            <input type="number" name="stock" value="1" min="1" step="1" style="width:100%">
            <small style="opacity:0.7">Número de unidades que estarán disponibles para comprar.</small>
          </div>

          <div class="form-group" style="margin-bottom:10px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" name="infinite">
              <span><strong>Stock infinito</strong> — si se marca, la cantidad de arriba se ignora.</span>
            </label>
          </div>

          <div class="form-group" style="display:flex;flex-direction:column;gap:4px">
            <label><strong>Precio</strong></label>
            ${GrandLodgeApp._priceInput(defaultGp)}
          </div>
        </form>`,
      buttons: [
        {
          label: "Agregar", icon: "fa-plus", action: "add",
          callback: async (_ev, _btn, dialog) => {
            const root     = dialog.element ?? dialog;
            const f        = root.querySelector("form") ?? root;
            const infinite = !!f.querySelector("[name=infinite]")?.checked;
            const stockRaw = parseInt(f.querySelector("[name=stock]")?.value, 10);
            const stock    = Number.isFinite(stockRaw) && stockRaw > 0 ? stockRaw : 1;
            const price    = GrandLodgeApp._readPriceForm(f);

            const shopItems = game.settings.get(MODULE_ID, "shopItems");
            if (shopItems.find(i => i.uuid === item.uuid)) {
              ui.notifications.warn("Este item ya está en la tienda."); return;
            }
            shopItems.push({
              uuid: item.uuid, name: item.name, img: item.img,
              itemType: item.type, price, infinite,
              stock: infinite ? null : stock,
            });
            await game.settings.set(MODULE_ID, "shopItems", shopItems);
            game.grandLodge?.refresh?.();
            ui.notifications.info(
              infinite
                ? `${item.name} agregado a la tienda (stock infinito).`
                : `${item.name} agregado a la tienda (${stock} en stock).`
            );
          },
        },
        { label: "Cancelar", action: "cancel" },
      ],
    }).render(true);
  }

  // ── Drop de item en el mercado (cualquier jugador con su personaje) ────────

  async _onDropMarketItem(event) {
    // PF2e puede usar text/plain o application/json para el drag data
    let data;
    for (const fmt of ["text/plain", "application/json"]) {
      try { data = JSON.parse(event.dataTransfer.getData(fmt)); if (data) break; }
      catch { /* continuar */ }
    }
    if (!data?.uuid) return;
    if (data.type !== "Item") { ui.notifications.warn("Solo puedes vender items."); return; }

    const match = data.uuid.match(/^Actor\.([^.]+)\.Item\.([^.]+)$/);
    if (!match) { ui.notifications.warn("Solo puedes vender items de tu inventario (no del compendio)."); return; }
    const [, actorId, itemId] = match;

    const actor = game.actors.get(actorId);
    if (!actor) return;
    if (!game.user.isGM && !actor.isOwner) {
      ui.notifications.warn("Solo puedes vender items de tu propio personaje."); return;
    }

    // Verificar GM conectado ANTES de borrar el item, para evitar perder data
    if (!GrandLodgeApp._requireGM()) return;

    const item = actor.items.get(itemId);
    if (!item) { ui.notifications.warn("No se encontró el item en el inventario."); return; }

    const listings = game.settings.get(MODULE_ID, "marketplace");
    if (listings.find(l => l.actorId === actorId && l.itemId === itemId)) {
      ui.notifications.warn("Este item ya está en el mercado."); return;
    }

    const defaultGp = item.system?.price?.value?.gp ?? 0;
    const itemData  = item.toObject(); // snapshot antes de borrar

    new foundry.applications.api.DialogV2({
      window: { title: "Poner en venta", icon: "fa-tag" },
      content: `
        <form style="display:flex;flex-direction:column;gap:8px;padding:8px">
          <p style="margin:0">Vender: <strong>${item.name}</strong> <em style="font-size:11px;color:#888">(de ${actor.name})</em></p>
          <label>Precio:</label>
          ${GrandLodgeApp._priceInput(defaultGp)}
          <label>Nota (opcional):</label>
          <input type="text" name="note" placeholder="Ej: Buen estado, sin usar" style="width:100%">
        </form>`,
      buttons: [
        {
          label: "Poner en venta", icon: "fa-tag", action: "list",
          callback: async (_ev, _btn, dialog) => {
            const f = dialog.element.querySelector("form");
            const price = GrandLodgeApp._readPriceForm(f);
            const note  = f.querySelector("[name=note]").value;

            // Quitar item del inventario del vendedor (el dueño tiene permiso)
            await item.delete();

            const listing = {
              id: `mkt-${Date.now()}`,
              actorId, sellerName: actor.name,
              itemId, itemName: itemData.name,
              img: itemData.img, itemType: itemData.type,
              itemData,          // snapshot para transferir al comprador
              price, note, listedAt: Date.now(),
            };
            if (game.user.isGM) {
              await game.settings.set(MODULE_ID, "marketplace", [...listings, listing]);
              game.grandLodge?.refresh?.();
            } else {
              GrandLodgeApp._emit({ type: "marketList", listing });
              this.render();
            }
            ui.notifications.info(`${itemData.name} publicado en el mercado.`);
          },
        },
        { label: "Cancelar", action: "cancel" },
      ],
    }).render(true);
  }

  // ── Acciones estáticas ────────────────────────────────────────────────────

  static switchTab(event, target) {
    const tab = target.dataset.tab;
    if (!tab || this._activeTab === tab) return;
    this._activeTab = tab;
    this.render();
  }

  static filterMissions(event, target) {
    this._missionFilter = target.dataset.filter ?? "all";
    this.render();
  }

  static async openMission(event, target) {
    const missionId = target.closest("[data-mission-id]")?.dataset.missionId;
    if (!missionId) return;

    const missions = game.settings.get(MODULE_ID, "missions");
    const mission  = missions.find(m => m.id === missionId);
    if (!mission) return;

    // Misión ya asignada: ofrecer desasignar o reasignar
    if (mission.taken) {
      if (!game.user.isGM) return;

      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: mission.title, icon: "fa-scroll" },
        content: `<p>Esta misión está asignada a ${mission.assignedActorIds.length} agente(s).</p>
                  <p>¿Desasignar y marcarla como disponible?</p>`,
        yes: { label: "Desasignar", icon: "fa-rotate-left" },
        no:  { label: "Cancelar" },
      });
      if (!confirmed) return;

      const status = game.settings.get(MODULE_ID, "agentStatus");
      for (const actorId of mission.assignedActorIds) {
        if (status[actorId]?.missionId === missionId) {
          const { [actorId]: _, ...rest } = status;
          Object.assign(status, rest);
          delete status[actorId];
        }
      }
      await game.settings.set(MODULE_ID, "agentStatus", status);
      await game.settings.set(MODULE_ID, "missions", missions.map(m =>
        m.id === missionId ? { ...m, taken: false, assignedActorIds: [] } : m
      ));
      this.render();
      ui.notifications.info(`Misión "${mission.title}" desasignada.`);
      return;
    }

    const agentStatus = game.settings.get(MODULE_ID, "agentStatus");
    const agents = AgentUtils.getAgents(agentStatus).filter(a => a.status === "available");

    const content = await renderTemplate(
      "modules/grand-lodge-hub/templates/mission-dialog.hbs",
      { mission, agents }
    );

    new foundry.applications.api.DialogV2({
      window: { title: mission.title, icon: "fa-scroll" },
      content,
      buttons: [
        {
          label: "Confirmar asignación",
          icon:  "fa-check",
          action: "confirm",
          callback: async (_event, _btn, dialog) => {
            const form    = dialog.element.querySelector("form");
            const checked = [...form.querySelectorAll("input[name='agents']:checked")]
              .map(i => i.value);

            if (!checked.length) {
              ui.notifications.warn("Selecciona al menos un agente.");
              return false;
            }

            const updated = missions.map(m => {
              if (m.id !== missionId) return m;
              return { ...m, taken: true, assignedActorIds: checked };
            });
            await game.settings.set(MODULE_ID, "missions", updated);

            const status = game.settings.get(MODULE_ID, "agentStatus");
            for (const actorId of checked) {
              status[actorId] = { status: "on-mission", missionId, missionTitle: mission.title };
            }
            await game.settings.set(MODULE_ID, "agentStatus", status);

            this.render();
            ui.notifications.info(`Misión "${mission.title}" asignada.`);
          },
        },
        { label: "Cancelar", action: "cancel" },
      ],
    }).render(true);
  }

  static async deleteMission(event, target) {
    if (!game.user.isGM) return;
    const id = target.closest("[data-mission-id]")?.dataset.missionId;
    if (!id) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Borrar misión" },
      content: "<p>¿Seguro que quieres borrar esta misión? Esta acción no se puede deshacer.</p>",
    });
    if (!confirmed) return;

    const missions = game.settings.get(MODULE_ID, "missions");
    await game.settings.set(MODULE_ID, "missions", missions.filter(m => m.id !== id));
    this.render();
  }

  static async cycleAgent(event, target) {
    if (!game.user.isGM) return;
    const actorId = target.closest("[data-actor-id]")?.dataset.actorId;
    if (!actorId) return;

    const CYCLE   = { available: "on-mission", "on-mission": "resting", resting: "available" };
    const status  = game.settings.get(MODULE_ID, "agentStatus");
    const current = status[actorId]?.status ?? "available";
    const next    = CYCLE[current] ?? "available";

    if (next === "available") {
      const { [actorId]: _, ...rest } = status;
      await game.settings.set(MODULE_ID, "agentStatus", rest);
    } else {
      status[actorId] = { ...status[actorId], status: next };
      await game.settings.set(MODULE_ID, "agentStatus", status);
    }

    this.render();
  }

  static openActorSheet(event, target) {
    const actorId = target.closest("[data-actor-id]")?.dataset.actorId;
    if (!actorId) return;
    game.actors.get(actorId)?.sheet?.render(true);
  }

  static async addChronicle() {
    if (!game.user.isGM) return;

    new foundry.applications.api.DialogV2({
      window: { title: "Nueva entrada en la Crónica", icon: "fa-book-open" },
      content: `
        <form style="display:flex;flex-direction:column;gap:10px;padding:8px">
          <div>
            <label style="font-size:13px;color:var(--color-text-dark-secondary)">Fecha / Era</label>
            <input name="date" type="text" placeholder="Ej: Día 12 — Año post-Pan 3" style="width:100%">
          </div>
          <div>
            <label style="font-size:13px;color:var(--color-text-dark-secondary)">Título</label>
            <input name="title" type="text" placeholder="Título del evento" style="width:100%">
          </div>
          <div>
            <label style="font-size:13px;color:var(--color-text-dark-secondary)">Descripción</label>
            <textarea name="text" rows="4" placeholder="¿Qué sucedió?" style="width:100%"></textarea>
          </div>
        </form>`,
      buttons: [
        {
          label: "Guardar", icon: "fa-save", action: "save",
          callback: async (_ev, _btn, dialog) => {
            const form  = dialog.element.querySelector("form");
            const entry = {
              date:      form.querySelector("[name=date]").value  || "Fecha desconocida",
              title:     form.querySelector("[name=title]").value || "Sin título",
              text:      form.querySelector("[name=text]").value  || "",
              timestamp: Date.now(),
            };
            const chronicle = game.settings.get(MODULE_ID, "chronicle");
            await game.settings.set(MODULE_ID, "chronicle", [...chronicle, entry]);
            this.render();
          },
        },
        { label: "Cancelar", action: "cancel" },
      ],
    }).render(true);
  }

  static async addMission() {
    if (!game.user.isGM) return;

    new foundry.applications.api.DialogV2({
      window: { title: "Nueva misión", icon: "fa-scroll" },
      content: `
        <form style="display:flex;flex-direction:column;gap:8px;padding:8px">
          <input name="title" type="text" placeholder="Título" style="width:100%">
          <select name="type" style="width:100%">
            <option value="principal">Principal</option>
            <option value="bounty">Contrato</option>
            <option value="quest">Encargo</option>
            <option value="evento">Evento</option>
          </select>
          <input name="region" type="text" placeholder="Región" style="width:100%">
          <textarea name="desc" rows="3" placeholder="Descripción" style="width:100%"></textarea>
          <input name="requester" type="text" placeholder="Solicitante" style="width:100%">
          <input name="nivel" type="text" placeholder="Nivel (ej: 1-2)" style="width:100%">
          <input name="duracion" type="text" placeholder="Duración" style="width:100%">
          <input name="reward" type="text" placeholder="Recompensa" style="width:100%">
        </form>`,
      buttons: [
        {
          label: "Crear misión", icon: "fa-plus", action: "create",
          callback: async (_ev, _btn, dialog) => {
            const f = dialog.element.querySelector("form");
            const newMission = {
              id:       `custom-${Date.now()}`,
              type:     f.querySelector("[name=type]").value,
              title:    f.querySelector("[name=title]").value || "Sin título",
              region:    f.querySelector("[name=region]").value,
              desc:      f.querySelector("[name=desc]").value,
              requester: f.querySelector("[name=requester]").value,
              nivel:     f.querySelector("[name=nivel]").value,
              duracion:  f.querySelector("[name=duracion]").value,
              reward:    f.querySelector("[name=reward]").value,
              ref:      "Misión personalizada",
              taken:    false,
              assignedActorIds: [],
            };
            const missions = game.settings.get(MODULE_ID, "missions");
            await game.settings.set(MODULE_ID, "missions", [...missions, newMission]);
            this.render();
          },
        },
        { label: "Cancelar", action: "cancel" },
      ],
    }).render(true);
  }

  static async editMission(event, target) {
    if (!game.user.isGM) return;

    const missionId = target.closest("[data-mission-id]")?.dataset.missionId;
    if (!missionId) return;

    const missions = game.settings.get(MODULE_ID, "missions");
    const mission  = missions.find(m => m.id === missionId);
    if (!mission) return;

    const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
    const opt = (val, label) =>
      `<option value="${val}" ${mission.type === val ? "selected" : ""}>${label}</option>`;

    new foundry.applications.api.DialogV2({
      window: { title: "Editar misión", icon: "fa-scroll" },
      content: `
        <form style="display:flex;flex-direction:column;gap:8px;padding:8px">
          <input name="title" type="text" placeholder="Título" value="${esc(mission.title)}" style="width:100%">
          <select name="type" style="width:100%">
            ${opt("principal", "Principal")}
            ${opt("bounty", "Contrato")}
            ${opt("quest", "Encargo")}
            ${opt("evento", "Evento")}
          </select>
          <input name="region" type="text" placeholder="Región" value="${esc(mission.region)}" style="width:100%">
          <textarea name="desc" rows="3" placeholder="Descripción" style="width:100%">${esc(mission.desc)}</textarea>
          <input name="requester" type="text" placeholder="Solicitante" value="${esc(mission.requester)}" style="width:100%">
          <input name="nivel" type="text" placeholder="Nivel (ej: 1-2)" value="${esc(mission.nivel)}" style="width:100%">
          <input name="duracion" type="text" placeholder="Duración" value="${esc(mission.duracion)}" style="width:100%">
          <input name="reward" type="text" placeholder="Recompensa" value="${esc(mission.reward)}" style="width:100%">
        </form>`,
      buttons: [
        {
          label: "Guardar cambios", icon: "fa-save", action: "save",
          callback: async (_ev, _btn, dialog) => {
            const f = dialog.element.querySelector("form");
            const updated = missions.map(m => m.id === missionId
              ? {
                  ...m,
                  type:     f.querySelector("[name=type]").value,
                  title:    f.querySelector("[name=title]").value || "Sin título",
                  region:    f.querySelector("[name=region]").value,
                  desc:      f.querySelector("[name=desc]").value,
                  requester: f.querySelector("[name=requester]").value,
                  nivel:     f.querySelector("[name=nivel]").value,
                  duracion: f.querySelector("[name=duracion]").value,
                  reward:   f.querySelector("[name=reward]").value,
                }
              : m);
            await game.settings.set(MODULE_ID, "missions", updated);
            this.render();
          },
        },
        { label: "Cancelar", action: "cancel" },
      ],
    }).render(true);
  }

  static async takeShopItem(event, target) {
    const uuid = target.dataset.itemUuid ?? target.closest("[data-item-uuid]")?.dataset.itemUuid;
    if (!uuid) return;

    const actorId = this._selectedActorId;
    if (!actorId) { ui.notifications.warn("Selecciona un personaje primero."); return; }

    const actor = game.actors.get(actorId);
    if (!actor) { ui.notifications.warn("Personaje no encontrado."); return; }
    if (!game.user.isGM && !actor.isOwner) {
      ui.notifications.warn("No tienes permiso sobre ese personaje."); return;
    }

    const shopItems = game.settings.get(MODULE_ID, "shopItems");
    const shopEntry = shopItems.find(i => i.uuid === uuid);
    if (!shopEntry) return;
    if (!shopEntry.infinite && shopEntry.stock <= 0) { ui.notifications.warn("Sin stock."); return; }

    // Si el item tiene stock finito y el comprador no es GM, necesitamos GM para decrementar
    if (!shopEntry.infinite && !GrandLodgeApp._requireGM()) return;

    const priceCp    = GrandLodgeApp._toCp(shopEntry.price);
    const priceLabel = GrandLodgeApp._priceLabel(shopEntry.price);
    const coinsObj   = GrandLodgeApp._toCoinsObj(shopEntry.price);

    if (priceCp > 0) {
      if (GrandLodgeApp._actorCopperValue(actor) < priceCp) {
        ui.notifications.warn(`${actor.name} no tiene suficiente dinero (necesita ${priceLabel}, tiene ${GrandLodgeApp._actorCoinsLabel(actor)}).`);
        return;
      }
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Confirmar compra" },
        content: `<p>¿Pagar <strong>${priceLabel}</strong> por <strong>${shopEntry.name}</strong>?</p>
                  <p style="font-size:11px;color:#888">Saldo de ${actor.name}: ${GrandLodgeApp._actorCoinsLabel(actor)}</p>`,
      });
      if (!confirmed) return;

      const ok = await GrandLodgeApp._actorRemoveCoins(actor, coinsObj);
      if (!ok) { ui.notifications.warn("No se pudo descontar el oro."); return; }
    }

    const item = await fromUuid(uuid);
    if (!item) { ui.notifications.warn("No se pudo encontrar el item."); return; }
    await actor.createEmbeddedDocuments("Item", [item.toObject()]);

    if (!shopEntry.infinite) {
      if (game.user.isGM) {
        const newStock = shopEntry.stock - 1;
        await game.settings.set(MODULE_ID, "shopItems",
          newStock <= 0
            ? shopItems.filter(i => i.uuid !== uuid)
            : shopItems.map(i => i.uuid !== uuid ? i : { ...i, stock: newStock })
        );
        game.grandLodge?.refresh?.();
      } else {
        GrandLodgeApp._emit({ type: "shopDecrement", uuid });
      }
    }

    ui.notifications.info(`${shopEntry.name} adquirido por ${actor.name}${priceCp > 0 ? ` (${priceLabel})` : " (gratis)"}.`);
    this.render();
  }

  static async removeShopItem(event, target) {
    if (!game.user.isGM) return;
    const uuid = target.dataset.itemUuid ?? target.closest("[data-item-uuid]")?.dataset.itemUuid;
    if (!uuid) return;
    const items = game.settings.get(MODULE_ID, "shopItems");
    await game.settings.set(MODULE_ID, "shopItems", items.filter(i => i.uuid !== uuid));
    game.grandLodge?.refresh?.();
  }

  static async buyMarketItem(event, target) {
    const listingId = target.closest("[data-listing-id]")?.dataset.listingId;
    if (!listingId) return;

    const listings = game.settings.get(MODULE_ID, "marketplace");
    const listing  = listings.find(l => l.id === listingId);
    if (!listing) return;

    const actorId = this._selectedActorId;
    if (!actorId) { ui.notifications.warn("Selecciona tu personaje primero."); return; }

    const buyer = game.actors.get(actorId);
    if (!buyer) return;
    if (!game.user.isGM && !buyer.isOwner) {
      ui.notifications.warn("No tienes permiso sobre ese personaje."); return;
    }
    if (listing.actorId === actorId) {
      ui.notifications.warn("No puedes comprar tu propio item."); return;
    }

    // Necesitamos GM para procesar el lado del vendedor + eliminar listing
    if (!GrandLodgeApp._requireGM()) return;

    const priceCp    = GrandLodgeApp._toCp(listing.price);
    const priceLabel = GrandLodgeApp._priceLabel(listing.price);
    const coinsObj   = GrandLodgeApp._toCoinsObj(listing.price);

    if (priceCp > 0 && GrandLodgeApp._actorCopperValue(buyer) < priceCp) {
      ui.notifications.warn(`${buyer.name} no tiene suficiente dinero (necesita ${priceLabel}, tiene ${GrandLodgeApp._actorCoinsLabel(buyer)}).`);
      return;
    }

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Confirmar compra" },
      content: `<p>Comprar <strong>${listing.itemName}</strong> de <strong>${listing.sellerName}</strong> por <strong>${priceLabel}</strong>.</p>
                <p style="font-size:11px;color:#888">Saldo de ${buyer.name}: ${GrandLodgeApp._actorCoinsLabel(buyer)}</p>`,
    });
    if (!confirmed) return;

    if (!listing.itemData) {
      ui.notifications.warn("Listing inválido: sin datos del item."); return;
    }

    // Descontar oro del comprador (el jugador puede modificar su propio actor)
    if (priceCp > 0) {
      const ok = await GrandLodgeApp._actorRemoveCoins(buyer, coinsObj);
      if (!ok) { ui.notifications.warn("No se pudo descontar el oro."); return; }
    }

    // Dar item al comprador (usando snapshot — el item ya fue removido del vendedor al publicar)
    await buyer.createEmbeddedDocuments("Item", [listing.itemData]);

    // Pagar al vendedor + eliminar listing (requiere scope world → socket si no es GM)
    if (game.user.isGM) {
      const seller = game.actors.get(listing.actorId);
      if (seller && priceCp > 0) await GrandLodgeApp._actorAddCoins(seller, coinsObj);
      await game.settings.set(MODULE_ID, "marketplace", listings.filter(l => l.id !== listingId));
      game.grandLodge?.refresh?.();
    } else {
      GrandLodgeApp._emit({
        type:     "marketBuyComplete",
        listingId,
        sellerId: listing.actorId,
        price:    coinsObj,
      });
    }

    ui.notifications.info(`${listing.itemName} comprado por ${buyer.name}.`);
    this.render();
  }

  static async viewShopItem(event, target) {
    const uuid = target.dataset.itemUuid ?? target.closest("[data-item-uuid]")?.dataset.itemUuid;
    if (!uuid) return;
    const item = await fromUuid(uuid);
    item?.sheet?.render(true);
  }

  static async viewMarketItem(event, target) {
    const listingId = target.closest("[data-listing-id]")?.dataset.listingId;
    if (!listingId) return;
    const listings = game.settings.get(MODULE_ID, "marketplace");
    const listing  = listings.find(l => l.id === listingId);
    if (!listing?.itemData) return;
    // Item ya fue removido del inventario — crear instancia temporal para ver la sheet
    const tempItem = new CONFIG.Item.documentClass(listing.itemData);
    tempItem.sheet?.render(true);
  }

  static async removeMarketListing(event, target) {
    const listingId = target.closest("[data-listing-id]")?.dataset.listingId;
    if (!listingId) return;

    const listings = game.settings.get(MODULE_ID, "marketplace");
    const listing  = listings.find(l => l.id === listingId);
    if (!listing) return;

    const sellerActor = game.actors.get(listing.actorId);
    if (!game.user.isGM && !sellerActor?.isOwner) {
      ui.notifications.warn("Solo el vendedor puede retirar su item."); return;
    }

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Retirar del mercado" },
      content: `<p>¿Retirar <strong>${listing.itemName}</strong> del mercado? El item volverá a tu inventario.</p>`,
    });
    if (!confirmed) return;

    if (game.user.isGM) {
      // Devolver item al vendedor
      const sellerActor = game.actors.get(listing.actorId);
      if (sellerActor && listing.itemData)
        await sellerActor.createEmbeddedDocuments("Item", [listing.itemData]);
      await game.settings.set(MODULE_ID, "marketplace", listings.filter(l => l.id !== listingId));
      game.grandLodge?.refresh?.();
    } else {
      // El jugador puede devolver el item a su propio actor
      const sellerActor = game.actors.get(listing.actorId);
      if (sellerActor?.isOwner && listing.itemData)
        await sellerActor.createEmbeddedDocuments("Item", [listing.itemData]);
      GrandLodgeApp._emit({ type: "marketRemove", listingId, userId: game.user.id });
    }
    this.render();
  }

  static async toggleAgentVisibility(event, target) {
    if (!game.user.isGM) return;
    const actorId = target.closest("[data-actor-id]")?.dataset.actorId;
    if (!actorId) return;
    const hidden = game.settings.get(MODULE_ID, "hiddenAgents");
    if (hidden[actorId]) {
      const { [actorId]: _, ...rest } = hidden;
      await game.settings.set(MODULE_ID, "hiddenAgents", rest);
    } else {
      await game.settings.set(MODULE_ID, "hiddenAgents", { ...hidden, [actorId]: true });
    }
    this.render();
  }

  static async deleteChronicle(event, target) {
    if (!game.user.isGM) return;
    const ts = parseInt(target.closest("[data-timestamp]")?.dataset.timestamp, 10);
    if (!ts) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Borrar entrada" },
      content: "<p>¿Eliminar esta entrada de la crónica? No se puede deshacer.</p>",
    });
    if (!confirmed) return;
    const chronicle = game.settings.get(MODULE_ID, "chronicle");
    await game.settings.set(MODULE_ID, "chronicle", chronicle.filter(e => e.timestamp !== ts));
    this.render();
  }

} // ← cierre real de la clase
