# Fallera Elo

Clasificación Elo para partidas de **La Fallera Calavera**. La aplicación permite registrar jugadores, jugar partidas, simular resultados, comparar barajas y recalcular la clasificación desde el historial completo.

## Funciones actuales

- Ranking principal con Elo, victorias, derrotas, porcentaje de victorias y partidas jugadas.
- Gestión de jugadores: alta, edición y eliminación.
- Gestión de barajas: creación, edición y bloqueo de eliminación si ya están en uso.
- Registro de partidas con fecha, baraja, ediciones activas y participantes por orden de clasificación.
- Validación de edición base: la edición 1 siempre queda incluida y bloqueada en la UI.
- Historial de partidas con posibilidad de editar o eliminar resultados.
- Simulador de partida para comprobar cuántos puntos subirías o bajarías en una partida ficticia.
- Evolución del Elo con filtro por fechas y puntos por partida.
- Sincronización opcional con GitHub mediante `database.json` y actualización automática.

## Pestañas principales

- Clasificación: resumen general del Elo actual.
- Historial: listado cronológico de partidas jugadas.
- Jugadores: gestión del listado de participantes.
- Barajas: catálogo de mazos y edición máxima disponible.
- Simular partida: cálculo instantáneo del cambio de Elo para todos los jugadores.
- Evolución: gráfico de progresión del Elo por fechas.

## Uso local

1. Abre la carpeta del proyecto.
2. Sirve los archivos localmente con un servidor estático.
3. Entra en la ruta del navegador, por ejemplo: http://localhost:8000

También puedes publicar directamente `index.html`, `styles.css` y `app.js` en un hosting estático.

## Simular partida

En la pestaña **Simular partida** puedes:

- elegir cuántos jugadores participan,
- introducir el Elo inicial de cada uno,
- seleccionar quién gana la simulación,
- ver el cambio simultáneo de Elo para todos.

La simulación usa la misma lógica del cálculo Elo de la aplicación, con un ajuste mínimo de 1 punto y sin escribir nada en la base de datos.

## Configuración de GitHub

La configuración por defecto apunta a:

- Propietario: `IvanRemolina`
- Repositorio: `FalleraCalabera`
- Rama: `main`

Para guardar cambios en GitHub:

1. Abre **Configuración**.
2. Añade un token personal con permisos de lectura/escritura sobre el repositorio.
3. Guarda la configuración.

El token se guarda en `localStorage` del navegador. No lo compartas ni lo publiques en repositorios.

## Reglas del cálculo Elo

- Cada jugador nuevo empieza con `100` puntos.
- La probabilidad esperada se calcula con la fórmula estándar de Elo:

  $$
  P(X) = \frac{10^{X/400}}{\sum_{i=1}^{n} 10^{R_i/400}}
  $$

- El ganador recibe una variación basada en `25 × (1 - probabilidad)`.
- Los demás reciben `25 × (0 - probabilidad)`.
- Cada cambio se redondea a entero y, si el resultado es muy pequeño, se fuerza un mínimo de 1 punto.
- El historial completo es la fuente de verdad, y el ranking se reconstruye al cargar los datos.

## Datos y estructura

`database.json` contiene esta estructura base:

```json
{
  "players": [],
  "games": [],
  "decks": []
}
```

Cada partida guarda:

```json
{
  "id": "...",
  "date": "...",
  "players": ["id-jugador-1", "id-jugador-2"],
  "deckId": "...",
  "editions": [1, 2, 3]
}
```

Cada baraja guarda:

```json
{
  "id": "...",
  "name": "Fallera Calavera",
  "maxEdition": 3
}
```

Reglas importantes:

- La edición 1 siempre queda incluida en cualquier partida de esa baraja.
- Las partidas antiguas sin `deckId` siguen funcionando y se muestran como “Baraja no especificada”.
- Si una baraja ya se está usando, no se puede eliminar para evitar romper la referencia histórica.
- El nombre y el Elo inicial del jugador se conservan junto con el historial.

## Sincronización y despliegue

- Leer datos es público y no necesita token.
- Guardar jugadores, partidas y barajas usa la API de GitHub con el token del propietario.
- Cada escritura genera un commit técnico de `database.json` en el repositorio.
- El navegador consulta los datos cada 5 segundos y vuelve a renderizar la vista si hay cambios.
- Si dos personas guardan a la vez, puede haber conflictos. Para uso doméstico o compartido controlado, conviene que solo una persona edite al mismo tiempo.

## Estructura del proyecto

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Estructura de la interfaz, pestañas y modales |
| `styles.css` | Tema visual, paneles, modales y estilo de ediciones |
| `app.js` | Lógica principal, cálculo Elo, render y sincronización |
| `database.json` | Datos persistentes de jugadores, partidas y barajas |

## Notas de mantenimiento

- Si cambias la lógica del Elo, revisa también la pestaña de simulación para que ambos cálculos sigan coincidiendo.
- Si cambias el modelo de barajas, asegúrate de mantener la compatibilidad con partidas antiguas.
- La edición 1 está diseñada como base obligatoria, así que cualquier cambio visual o funcional debe respetar ese comportamiento.
