/**
 * Grand Lodge Hub — Módulo para FoundryVTT v13 + PF2e
 * Entry point: registra hooks, settings y el botón de acceso al hub.
 */

import { GrandLodgeApp } from "./hub-app.mjs";
import { MissionData }   from "./mission-data.mjs";

const MODULE_ID = "grand-lodge-hub";

// Exponer instancia global para macros/consola
let _hubInstance = null;

// ─── INIT ────────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Inicializando Grand Lodge Hub`);

  // Settings: datos de misiones persistidos en el mundo
  game.settings.register(MODULE_ID, "missions", {
    name: "Misiones",
    scope: "world",
    config: false,
    type: Array,
    default: MissionData.defaults(),
  });

  // Settings: estado de agentes (status, misionActual)
  game.settings.register(MODULE_ID, "agentStatus", {
    name: "Estado de Agentes",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });

  // Settings: entradas de crónica
  game.settings.register(MODULE_ID, "chronicle", {
    name: "Crónica",
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register(MODULE_ID, "shopItems", {
    name: "Items de la tienda",
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register(MODULE_ID, "marketplace", {
    name: "Mercado de Agentes",
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register(MODULE_ID, "hiddenAgents", {
    name: "Agentes ocultos",
    scope: "world",
    config: false,
    type: Object,
    default: {},
  });
});

// ─── READY ───────────────────────────────────────────────────────────────────

Hooks.once("ready", () => {
  const refreshAll = () => {
    game.socket.emit(`module.${MODULE_ID}`, { type: "refreshHub" });
    if (_hubInstance?.rendered) _hubInstance.render();
  };
  game.grandLodge = { open: () => openHub(), refresh: refreshAll };

  // Socket: el GM procesa todas las escrituras de mundo que los jugadores no pueden hacer
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    console.log(`${MODULE_ID} | socket recibido:`, data?.type, data);

    // Refresh broadcasted desde el GM tras cualquier escritura — todos los clientes re-renderizan
    if (data.type === "refreshHub") {
      if (_hubInstance?.rendered) _hubInstance.render();
      return;
    }

    if (!game.user.isGM) return;
    // Sólo el GM activo primario procesa (evita duplicación con múltiples GMs)
    const activeGM = game.users.activeGM ?? game.users.find(u => u.isGM && u.active);
    if (activeGM?.id !== game.user.id) return;
    console.log(`${MODULE_ID} | procesando como GM activo:`, data.type);

    const broadcastRefresh = refreshAll;

    if (data.type === "marketBuyComplete") {
      // Item ya fue removido del inventario del vendedor al publicar — solo pagar y eliminar listing
      const { listingId, sellerId, price } = data;
      const seller = game.actors.get(sellerId);
      if (seller && price && Object.values(price).some(v => v > 0)) {
        if (typeof seller.inventory?.addCoins === "function") {
          await seller.inventory.addCoins(price);
        } else {
          const c  = seller.system?.coins ?? {};
          const cp = (c.pp||0)*1000 + (c.gp||0)*100 + (c.sp||0)*10 + (c.cp||0)
                   + (price.pp||0)*1000 + (price.gp||0)*100 + (price.sp||0)*10 + (price.cp||0);
          const pp = Math.floor(cp/1000), r1 = cp%1000;
          const gp = Math.floor(r1/100),  r2 = r1%100;
          const sp = Math.floor(r2/10),   cpR = r2%10;
          await seller.update({ "system.coins.pp": pp, "system.coins.gp": gp,
                                 "system.coins.sp": sp, "system.coins.cp": cpR });
        }
      }
      const listings = game.settings.get(MODULE_ID, "marketplace");
      await game.settings.set(MODULE_ID, "marketplace", listings.filter(l => l.id !== listingId));
      broadcastRefresh();
    }

    if (data.type === "marketList") {
      const listings = game.settings.get(MODULE_ID, "marketplace");
      await game.settings.set(MODULE_ID, "marketplace", [...listings, data.listing]);
      broadcastRefresh();
    }

    if (data.type === "marketRemove") {
      // El cliente ya devolvió el item al vendedor — solo validar y eliminar listing
      const { listingId, userId } = data;
      const listings = game.settings.get(MODULE_ID, "marketplace");
      const listing  = listings.find(l => l.id === listingId);
      if (!listing) return;
      const requestingUser = game.users.get(userId);
      const sellerActor    = game.actors.get(listing.actorId);
      const hasPermission  = requestingUser?.isGM
        || (sellerActor && sellerActor.testUserPermission(requestingUser, "OWNER"));
      if (!hasPermission) return;
      await game.settings.set(MODULE_ID, "marketplace", listings.filter(l => l.id !== listingId));
      broadcastRefresh();
    }

    if (data.type === "shopDecrement") {
      const items    = game.settings.get(MODULE_ID, "shopItems");
      const entry    = items.find(i => i.uuid === data.uuid);
      if (!entry || entry.infinite) return;
      const newStock = entry.stock - 1;
      await game.settings.set(MODULE_ID, "shopItems",
        newStock <= 0
          ? items.filter(i => i.uuid !== data.uuid)
          : items.map(i => i.uuid !== data.uuid ? i : { ...i, stock: newStock })
      );
      broadcastRefresh();
    }
  });
  
  setTimeout(() => {
    const sidebar = document.querySelector("#sidebar");
    if (sidebar && !sidebar.querySelector(".grand-lodge-btn")) {
      const btn = document.createElement("button");
      btn.className = "grand-lodge-btn";
      btn.innerHTML = `<i class="fa-solid fa-scroll"></i> Grand Lodge`;
      btn.style.cssText = "width:100%;margin-bottom:4px;background:rgba(155,89,182,0.2);border:1px solid #9b59b6;color:#c39bd3;cursor:pointer;padding:4px 8px;font-size:13px;position:relative;z-index:1000;pointer-events:all;";
      btn.addEventListener("click", () => openHub());
      sidebar.prepend(btn);
    }
  }, 2000);

  // Re-renderizar el hub en todos los clientes cuando cambia cualquier setting del módulo
  Hooks.on("updateSetting", (setting) => {
    if (!setting.key?.startsWith(MODULE_ID)) return;
    if (_hubInstance?.rendered) _hubInstance.render();
  });

  console.log(`${MODULE_ID} | Grand Lodge Hub listo.`);
});

Hooks.on("renderApplication", (app, html) => {
  if (app.id !== "sidebar") return;
  if (html.querySelector(".grand-lodge-btn")) return;

  const btn = document.createElement("button");
  btn.className = "grand-lodge-btn";
  btn.innerHTML = `<i class="fa-solid fa-scroll"></i> Grand Lodge`;
  btn.style.cssText = "width:100%;margin-bottom:4px;background:rgba(155,89,182,0.2);border:1px solid #9b59b6;color:#c39bd3;cursor:pointer;padding:4px 8px;font-size:13px;";
  btn.addEventListener("click", () => openHub());
  html.prepend(btn);
});

// ─── BOTÓN EN SIDEBAR ────────────────────────────────────────────────────────



// ─── FUNCIÓN PRINCIPAL ───────────────────────────────────────────────────────

function openHub() {
  if (_hubInstance?.rendered) {
    _hubInstance.bringToTop();
    return;
  }
  _hubInstance = new GrandLodgeApp();
  _hubInstance.render(true);
}
