# Credenciales Digitales QR CHC - v1.0.48

## Correcciones de interfaz y reportes de eventos

### 1. Resumen de antigüedad más claro
- Cuando están seleccionados todos los rangos ya no se muestra una frase ambigua como "5 asistentes en este filtro".
- Ahora se muestra, por ejemplo: `Mostrando 749 invitados · 5 con asistencia`.
- Cuando sí existe un filtro parcial se muestra: `Mostrando 126 invitados en la selección · 83 con asistencia`.

### 2. Escáner QR plegable
- Se conserva el escáner grande y fijo mientras se utiliza.
- Se agregó `Ocultar escáner` / `Mostrar escáner`.
- Al ocultarlo, si la cámara estaba activa se pausa para evitar escaneos accidentales y ahorrar batería.
- Al volver a mostrarlo, si estaba activa antes de ocultarlo se intenta reanudar automáticamente.
- En modo oculto aparecen accesos rápidos a `Buscar empleado` y `Ver lista`.
- El filtro de antigüedad permanece visible para saber qué lista se está trabajando.

### 3. PDF corregido
- El PDF ya no depende de las fuentes instaladas en Railway.
- Ahora se genera como PDF vectorial usando fuentes estándar integradas en PDF con codificación WinAnsi.
- Se validaron caracteres en español: á, é, í, ó, ú, ñ y ü.
- Se mejoró la tabla en formato horizontal, con encabezado repetido en cada página y datos de asistencia/premio legibles.
- El encabezado indica si se exportó la lista completa o un filtro de antigüedad.

### 4. Excel más descriptivo
Antes de la tabla ahora incluye:
- Nombre y número del evento.
- Tipo y fecha.
- Totales del reporte.
- Si corresponde a lista completa o a un filtro de antigüedad.
- Fecha usada para calcular la antigüedad.

La tabla mantiene las columnas de antigüedad, rango, asistencia y premios.

## Base de datos
No requiere cambios de tablas, columnas ni scripts SQL.
