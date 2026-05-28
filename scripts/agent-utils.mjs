/**
 * AgentUtils — Lee actores PF2e tipo "character" del mundo
 * y los combina con el estado guardado por el módulo.
 */

export class AgentUtils {

  static STATUS_LABELS = {
    available:  "Disponible",
    "on-mission": "En misión",
    resting:    "Descansando",
  };

  static STATUS_ICONS = {
    available:    "fa-circle-check",
    "on-mission": "fa-person-running",
    resting:      "fa-moon",
  };

  /**
   * Devuelve un array de objetos de agente mezclando datos reales del actor
   * con el estado guardado por el módulo.
   *
   * @param {Object} agentStatus  - El setting "agentStatus" del módulo
   * @returns {AgentData[]}
   */
  static getAgents(agentStatus = {}) {
    // Solo personajes dentro de la carpeta "The Party" (incluye subcarpetas).
    // Si la carpeta no existe, no hay agentes.
    const partyFolder = game.folders.find(f => f.type === "Actor" && f.name === "The Party");
    const inParty = (actor) => {
      if (!partyFolder || !actor.folder) return false;
      return actor.folder.id === partyFolder.id
          || actor.folder.ancestors?.some(a => a.id === partyFolder.id);
    };
    const actors = game.actors.filter(a => a.type === "character" && inParty(a));

    return actors.map(actor => {
      const saved  = agentStatus[actor.id] ?? {};
      const status = saved.status ?? "available";

      return {
        actorId:      actor.id,
        name:         actor.name,
        img:          actor.img,
        // PF2e: nivel en actor.system.details.level.value
        level:        actor.system?.details?.level?.value ?? 1,
        // PF2e: clase en actor.system.details.class.name (puede no estar en todos los builds)
        className:    actor.system?.details?.class?.name
                      ?? actor.items.find(i => i.type === "class")?.name
                      ?? "Clase desconocida",
        status,
        statusLabel:  this.STATUS_LABELS[status] ?? status,
        statusIcon:   this.STATUS_ICONS[status]  ?? "fa-circle",
        missionTitle: saved.missionTitle ?? "",
      };
    });
  }
}
