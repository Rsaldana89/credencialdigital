# Módulo de Asistencia a Eventos CHC v1.0.39

Este módulo fue agregado sobre la versión 1.0.38 de Credenciales Digitales QR CHC sin modificar las tablas productivas existentes.

## Instalación de base de datos

Ejecutar **únicamente**:

`database/update_v1.0.39_events.sql`

El script crea estas tablas nuevas:

- `chc_events`
- `chc_event_attendees`
- `chc_event_action_logs`

No modifica `personal`, `employee_qr_tokens`, `employee_photos` ni `employee_qr_access_logs`.

## Despliegue

1. Respaldar la base de datos antes del cambio.
2. Ejecutar `database/update_v1.0.39_events.sql` en la misma base donde ya existen `personal` y `employee_qr_tokens`.
3. Desplegar los archivos de la versión 1.0.39 conservando el `.env` de producción actual.
4. Ejecutar `npm ci` en el servidor.
5. Reiniciar el proceso Node.js.
6. Ingresar al panel administrativo y abrir **Eventos**.

## Tipos de evento

- **General:** invitados + asistencia.
- **Fiesta con Premios:** invitados + asistencia + una sola entrega por empleado: `PREMIO` o `CONSOLACION`.

La columna `award_type` es única. Por diseño no existen dos columnas independientes que puedan quedar activas al mismo tiempo, así que un empleado no puede recibir ambos premios en el mismo evento.

## QR existentes

No se generan QR nuevos. El escáner recibe el contenido del QR actual (la URL `/e/<token>`), extrae el token y usa la validación existente de Credenciales Digitales en modo lectura.

El módulo no llama la bitácora productiva de accesos QR; sus acciones se registran en `chc_event_action_logs`.

## Escáner

La página de cada evento conserva el panel de escaneo en posición fija al desplazarse. La cámara se habilita solamente dentro de `/admin/eventos` y requiere HTTPS en producción. Si el navegador no permite la lectura QR o no hay cámara, se conserva la búsqueda manual por número o nombre.

## Historial del evento

Al crear el evento se copia a la tabla nueva una fotografía de estos datos:

- número de empleado
- nombre
- puesto
- departamento
- fecha de ingreso

Esto permite calcular y conservar la información del evento sin modificar la tabla `personal` y sin depender de que esos datos permanezcan iguales después.

## Exportación

Cada evento permite descargar:

- Excel `.xlsx`
- PDF `.pdf`

Ambos reportes incluyen identificación, puesto, antigüedad, asistencia y, para fiestas, resultado de premio/consolación.
