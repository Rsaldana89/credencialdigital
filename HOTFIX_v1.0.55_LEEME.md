# Credenciales Digitales QR CHC v1.0.55 - Hotfix reingresos y panel

Esta versión corrige una regresión introducida en v1.0.54.

## Qué estaba pasando

La migración SQL v1.0.54 no era la causa del error. El problema estaba en consultas SQL del código de v1.0.54: se habían insertado campos de reingreso en SELECT/INSERT donde no correspondían. Eso podía provocar error 500 en el Panel y en funciones relacionadas con QR.

Además, aunque `personal.fecha_reingreso` ya se consultaba en algunas partes, la credencial pública seguía usando `start_date` y los invitados de eventos existentes seguían basándose en el snapshot antiguo.

## Correcciones de v1.0.55

- Restaura las consultas sanas del Panel, QR y estadísticas.
- Usa como fecha laboral efectiva: `fecha_reingreso` si existe; de lo contrario `start_date`.
- Credencial pública: muestra `Fecha de Reingreso` cuando corresponda y muestra la antigüedad actual calculada desde esa fecha.
- PNG descargable: usa la misma fecha y antigüedad.
- Eventos ABIERTOS: recalculan la antigüedad contra la fecha del evento usando la información actual de `personal`, por lo que también corrige eventos creados antes del hotfix.
- Eventos CERRADOS: conservan el snapshot histórico de fecha efectiva/rango capturado al cerrarse.
- Conserva histórico, renombrado, nuevo rol Operador de Eventos, alerta de premio/consolación ya entregado, Ver credencial y exportaciones filtradas.
- Mantiene cámara, PWA, sonido, sincronización cada 30 segundos y consulta inmediata a MySQL en cada registro.

## Caso de validación 03296

Empleado: MARTINEZ CARAPIA MARIA DE LOURDES

- `start_date`: 05/03/2007
- `fecha_reingreso`: 22/04/2025

La aplicación debe mostrar `Fecha de Reingreso: 22/04/2025`.
Para un evento del 20/08/2026 debe calcular aproximadamente 1 año y 3 meses y clasificarla en `< 5 AÑOS`, no en 15-19 años.

## Base de datos

Si ya ejecutaste `database/update_v1.0.54_demo_feedback.sql`, NO necesitas ejecutar ninguna migración adicional para v1.0.55.

No volver a modificar `personal` ni `usuarios` de Incidencias.

## Despliegue

1. Mantener las variables actuales de Railway.
2. Desplegar todo el proyecto v1.0.55.
3. Esperar a que Railway ejecute `npm install` y arranque la aplicación.
4. Probar `/admin`.
5. Buscar el empleado 03296 y revisar su credencial.
6. Abrir un evento todavía ABIERTO y buscar CARAPIA: debe quedar en `< 5 AÑOS` para un evento de 2026 posterior al reingreso.

