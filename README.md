# Fallera Elo

Clasificación Elo para partidas de **La Fallera Calavera**. La aplicación permite registrar jugadores y resultados, recalcular la clasificación desde el historial y compartir los datos mediante GitHub.

## Funciones

- Tabla de clasificación con Elo, victorias, derrotas, porcentaje de victorias y partidas jugadas.
- Registro de partidas de 2 a 6 jugadores, ordenadas por puesto.
- Historial de partidas con opción de eliminar resultados.
- Alta, edición y eliminación de jugadores.
- Recalculado cronológico de la puntuación Elo usando una amplitud de 400 y `K = 25`.
- Modo local mediante `localStorage`.
- Sincronización opcional con `database.json` en GitHub y actualización automática cada 5 segundos.

## Uso local

El proyecto no necesita compilación ni dependencias de Node.js. Sirve los archivos desde cualquier servidor estático. Por ejemplo:

```bash
python3 -m http.server 8000
```

Después, abre <http://localhost:8000> en el navegador.

También puedes publicar directamente los archivos `index.html`, `styles.css` y `app.js` en un servicio de hosting estático.

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

## Modo local

Pulsa **Modo local** en la configuración para trabajar sin GitHub. Los cambios se guardan en el navegador mediante `localStorage` y no se comparten con otros dispositivos. Si se borra el almacenamiento del navegador, se perderán esos cambios locales.

## Datos

`database.json` contiene dos colecciones:

```json
{
	"players": [],
	"games": []
}
```

Cada jugador conserva su identificador, nombre y Elo inicial. Cada partida conserva la fecha y los identificadores de los jugadores en orden de clasificación, del primer puesto al último. El Elo actual y las estadísticas se reconstruyen al cargar los datos, por lo que el historial es la fuente de verdad.

## Estructura

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Estructura de la interfaz y modales |
| `styles.css` | Fondo, paneles, estados y animaciones |
| `app.js` | Interfaz, cálculo Elo, almacenamiento y API de GitHub |
| `database.json` | Datos compartidos de jugadores y partidas |