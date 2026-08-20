# Credenciales Digitales QR CHC v1.0.44

## Cambios

1. Los eventos de tipo General ya no muestran la sugerencia para activar premios.
2. Los botones Exportar Excel y Exportar PDF continúan disponibles en PC y celular.
3. Los archivos exportados toman la lista completa del evento. Para Fiesta con Premios, Excel incluye asistencia, premio, consolación, hora de entrega y usuario que registró la entrega; PDF incluye asistencia y tipo/hora de premio.
4. La pantalla del evento consulta cambios en la base de datos cada 30 segundos. Si otro dispositivo registra una asistencia o premio, la actualización periódica se refleja como máximo en unos 30 segundos. Cada escaneo y cada entrega de premio, en cambio, consulta MySQL de inmediato y no espera ese intervalo.
5. Para evitar duplicados cuando varias personas trabajan al mismo tiempo, la asistencia y los premios bloquean únicamente la fila del empleado que se está procesando. Así tres dispositivos pueden registrar personas diferentes en paralelo.
6. Si dos dispositivos procesan al mismo empleado, el segundo ve el estado ya registrado en MySQL y no duplica asistencia ni premio.

## Base de datos

No hay script SQL nuevo. Esta versión usa la estructura creada por `database/update_v1.0.39_events.sql`.
