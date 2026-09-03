# Fallera Elo

Clasificación Elo para partidas de **La Fallera Calavera**. La aplicación permite registrar jugadores y resultados, recalcular la clasificación desde el historial y compartir los datos mediante GitHub.

## Funciones

- Tabla de clasificación con Elo, victorias, derrotas, porcentaje de victorias y partidas jugadas.
- Gráfico de evolución del Elo por jugador, con puntos interactivos y filtro por fechas.
- Registro de partidas de 2 a 6 jugadores, ordenadas por puesto.
- Catálogo de barajas con un número de edición ampliable y selección por casillas.
- Historial de partidas con opción de eliminar resultados.
- Alta, edición y eliminación de jugadores.
- Recalculado cronológico de la puntuación Elo usando una amplitud de 400 y `K = 25`.
- Modo local mediante `localStorage`.
- Sincronización opcional con `database.json` en GitHub y actualización automática cada 5 segundos.

## Uso local

Después, abre <http://localhost:8000> en el navegador.

También puedes publicar directamente los archivos `index.html`, `styles.css` y `app.js` en un servicio de hosting estático.

## Evolución del Elo

En la pestaña **Evolución** se muestra una línea por jugador y un punto después de
cada partida. Al pasar el cursor sobre un punto se muestra el nombre y el Elo de
ese momento. Sin fechas seleccionadas se incluye todo el historial. El filtro de
inicio incluye el día desde las `00:00` y el filtro de fin lo incluye hasta las
`23:59:59.999`, por lo que se pueden consultar días completos.

## Configurar GitHub

La configuración predeterminada apunta a:

- Propietario: `IvanRemolina`
- Repositorio: `FalleraCalabera`
- Rama: `main`

Para guardar los cambios en GitHub:

1. Abre **Configuración** dentro de la aplicación.
2. Introduce un token personal de GitHub con permiso para leer y modificar el contenido del repositorio.
3. Guarda la configuración y carga los datos.

El token se guarda únicamente en el `localStorage` del navegador que lo configura. No lo compartas ni lo incluyas en el código publicado. Para una instalación compartida, `app.js` admite configurar `BUILT_IN_TOKEN`, pero hacerlo expone el token a cualquier persona que pueda descargar la aplicación.

La contraseña de edición predeterminada es `fallera`. Solo evita modificaciones accidentales en la interfaz; no sustituye los permisos de GitHub ni la seguridad del repositorio.

## Reglas del cálculo Elo

- Cada jugador nuevo empieza con `100` puntos.
- Para dos jugadores, la probabilidad esperada se calcula así:

  $$
  P(X)=\frac{10^{X/400}}{10^{X/400}+10^{Y/400}}
  $$

- En una partida de varios jugadores se usa la misma fórmula multinomial, con todos los participantes en el denominador.
- El ganador recibe `25 × (1 - probabilidad)` y cada perdedor recibe `25 × (0 - probabilidad)`.
- El resultado se redondea a puntos enteros y cada cambio tiene un mínimo de 1 punto. Esta última regla puede provocar una pequeña desviación respecto a la suma inicial.
- La desviación mostrada es la suma del Elo actual menos `100 × número de jugadores`. El porcentaje se calcula respecto a ese valor inicial.

El historial de partidas es la fuente de verdad. El Elo y las estadísticas se reconstruyen desde el principio cada vez que se cargan o modifican los datos.

## Sincronización y despliegue

- Leer el ranking es público y no necesita token.
- Guardar jugadores o partidas usa la API de contenidos de GitHub con el token del propietario.
- Cada escritura de `database.json` genera un commit técnico en GitHub. Eso es necesario para versionar el archivo, aunque no haya un commit manual ni una pipeline ejecutada por el usuario.
- GitHub Pages usa [`.github/workflows/pages.yml`](.github/workflows/pages.yml). Ese workflow despliega los cambios de la aplicación, pero ignora los commits que solo modifican `database.json`.
- Los navegadores consultan los datos cada 5 segundos. Es una actualización rápida, no tiempo real, y muchos dispositivos pueden alcanzar el límite de la API pública de GitHub.
- Si dos personas guardan cambios al mismo tiempo, ambas pueden partir de una versión antigua del archivo y una escritura puede ser rechazada por conflicto. Para el uso casero previsto, conviene que solo una persona edite a la vez.

La contraseña `fallera` está incluida en el JavaScript público y no es una medida de seguridad. El token sí permite escribir en el repositorio, por lo que nunca debe publicarse en `BUILT_IN_TOKEN` ni compartirse.

## Modo local

Pulsa **Modo local** en la configuración para trabajar sin GitHub. Los cambios se guardan en el navegador mediante `localStorage` y no se comparten con otros dispositivos. Si se borra el almacenamiento del navegador, se perderán esos cambios locales.

## Datos

`database.json` contiene tres colecciones:

```json
{
  "players": [],
  "games": []
}
```

Además, las partidas nuevas guardan el identificador de la baraja y las ediciones seleccionadas:

```json
{
  "players": [],
  "games": [
    {
      "id": "...",
      "date": "...",
      "players": ["..."],
      "deckId": "...",
      "editions": [1, 2, 3]
    }
  ],
  "decks": [{
    "id": "...",
    "name": "Fallera Calavera",
    "maxEdition": 3
  }]
}
```

Las partidas antiguas sin `deckId` siguen siendo válidas y se muestran como “Baraja no especificada”. Las barajas antiguas que solo tenían nombre y versión se adaptan automáticamente a una edición. Eliminar una baraja ya utilizada está bloqueado para no perder la referencia histórica.

Cada jugador conserva su identificador, nombre y Elo inicial. Cada partida conserva la fecha y los identificadores de los jugadores en orden de clasificación, del primer puesto al último. El Elo actual y las estadísticas se reconstruyen al cargar los datos, por lo que el historial es la fuente de verdad.

## Estructura

| Archivo                       | Responsabilidad                                        |
| ----------------------------- | ------------------------------------------------------ |
| `index.html`                  | Estructura de la interfaz y modales                    |
| `styles.css`                  | Fondo, paneles, estados y animaciones                  |
| `app.js`                      | Interfaz, cálculo Elo, almacenamiento y API de GitHub  |
| `database.json`               | Datos compartidos de jugadores, partidas y barajas     |
| `.github/workflows/pages.yml` | Despliegue de Pages excepto para cambios solo de datos |
