# v1.0.45 - Hora de México y escáner QR más visible

## Hora de asistencia y premios

La base de datos puede continuar trabajando en UTC. No se cambia la estructura de ninguna tabla.

Los campos automáticos del módulo de eventos que se guardan con `NOW()` (por ejemplo `attended_at` y `award_delivered_at`) se interpretan como UTC al mostrarse y se convierten a la zona `America/Mexico_City`.

Ejemplo:

- Base de datos: `2026-08-20 21:51:00`
- Pantalla / Excel / PDF: `20/08/2026 15:51`

Esto también corrige la visualización de registros anteriores que ya estaban guardados en UTC.

La fecha programada del evento (`event_date`) NO se desplaza, porque esa fecha la captura el usuario directamente como hora local.

La zona puede cambiarse opcionalmente con:

`EVENT_TIME_ZONE=America/Mexico_City`

No es obligatorio agregar la variable en Railway porque ese valor ya es el predeterminado.

## Escáner QR

Se aumentó el área visible de cámara tanto en PC como en celular.

- PC: aproximadamente 250 a 320 px de alto, dependiendo del ancho disponible.
- Celular: aproximadamente 210 a 290 px de alto.
- La guía cuadrada para centrar el QR es más grande y tiene borde más visible.
- No se cambia la resolución solicitada a la cámara ni la lógica de lectura.

## Sincronización

Se conserva la versión anterior:

- actualización automática cada 30 segundos;
- cada escaneo consulta inmediatamente al servidor/base de datos;
- los premios también se validan inmediatamente en la base de datos.
