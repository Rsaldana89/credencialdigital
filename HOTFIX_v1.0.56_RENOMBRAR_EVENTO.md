# Hotfix v1.0.56 - Renombrar eventos

## Problema corregido
La funcion de renombrar eventos registra la accion `EVENT_RENAMED` en `chc_event_action_logs`.
La columna `action_type` provenia de la migracion original de eventos como un `ENUM` que no incluia ese valor. MySQL devolvia:

`Data truncated for column 'action_type' at row 1`

La transaccion se revertia, por lo que el nombre del evento no se modificaba.

## Solucion
`action_type` pasa de ENUM a `VARCHAR(40)`. Esto conserva todos los registros historicos y permite registrar `EVENT_RENAMED` y nuevas acciones de auditoria sin volver a modificar el ENUM cada vez.

## Migracion requerida
Si ya tienes v1.0.54/v1.0.55 en produccion, ejecutar una sola vez:

`database/update_v1.0.56_event_action_type.sql`

Es idempotente: si `action_type` ya no es ENUM, no altera la columna.

No toca `personal`, `usuarios` ni tablas de Incidencias.
