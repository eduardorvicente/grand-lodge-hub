# Grand Lodge Hub — Módulo FoundryVTT v13

Tablero de operaciones para la campaña **Año de los Santuarios Rotos** (PFS2 Año 3 adaptado).

## Instalación

1. Copia la carpeta `grand-lodge-hub/` dentro de tu directorio de módulos de Foundry:
   ```
   {UserData}/modules/grand-lodge-hub/
   ```
2. En Foundry: **Configuración → Módulos Add-on → Gestionar módulos**
3. Activa **Grand Lodge — Tablero de Operaciones**
4. Reinicia el mundo si es necesario

## Uso

- Aparece un botón **Grand Lodge** en la parte inferior del sidebar (solo visible para el GM)
- También puedes abrir el hub desde la consola o una macro:
  ```js
  game.grandLodge.open();
  ```

## Funcionalidades

### 📜 Misiones
- Lista filtrable de misiones: Eventos · Principales · Contratos · Encargos
- Clic en una misión para ver detalles y asignar agentes
- Las misiones asignadas quedan marcadas automáticamente

### ⚔️ Agentes
- Lee automáticamente todos los personajes (`type: "character"`) del mundo PF2e
- Muestra nombre, clase, nivel e imagen del actor
- Clic para rotar estado: **Disponible → En Misión → Descansando**
- Botón para abrir la ficha del personaje directamente

### 🏪 Provisiones
- Tienda estática con equipamiento, pergaminos, servicios y artículos especiales

### 📖 Crónica
- Registro de eventos de la campaña
- El GM puede añadir nuevas entradas con fecha, título y descripción

## Estructura del módulo

```
grand-lodge-hub/
├── module.json
├── README.md
├── scripts/
│   ├── main.mjs          ← Entry point, hooks, botón sidebar
│   ├── hub-app.mjs       ← ApplicationV2 principal
│   ├── agent-utils.mjs   ← Lectura de actores PF2e
│   └── mission-data.mjs  ← Datos por defecto de misiones
├── templates/
│   ├── tabs.hbs
│   ├── missions.hbs
│   ├── agents.hbs
│   ├── shop.hbs
│   ├── chronicle.hbs
│   └── mission-dialog.hbs
├── styles/
│   └── grand-lodge.css
└── lang/
    └── es.json
```

## Datos persistentes

El módulo guarda en `game.settings` (scope: world):

| Setting        | Contenido                              |
|----------------|----------------------------------------|
| `missions`     | Array de misiones con estado y asignados |
| `agentStatus`  | Objeto `{ actorId: { status, missionTitle } }` |
| `chronicle`    | Array de entradas de la crónica        |

## Compatibilidad

- **Foundry VTT:** v13 (verificado en 13.351)
- **Sistema:** PF2e (recomendado; funciona en cualquier sistema con actores `type: "character"`)

## Próximas mejoras sugeridas

- [ ] Editar/borrar misiones desde el hub
- [ ] Notificaciones a jugadores cuando se les asigna una misión
- [ ] Integración con el calendario de Simple Calendar
- [ ] Panel de facciones con reputación por región
