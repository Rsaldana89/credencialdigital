# Credenciales Digitales QR CHC v1.0.54

## Cambios de la demo del 2 de septiembre

- Usa `personal.fecha_reingreso` como fecha efectiva cuando existe; en otro caso usa `personal.start_date`.
- La credencial muestra **Fecha de reingreso** cuando corresponde.
- Los eventos calculan antigüedad contra la fecha programada y respetan el aniversario exacto.
- Al cerrar un evento se guarda una fotografía histórica de la fecha efectiva y del rango de antigüedad.
- Aviso grande, sonido y vibración cuando un Premio o Consolación ya fue entregado.
- Excel/PDF filtrados incluyen todos los invitados de los rangos seleccionados, con o sin asistencia.
- Histórico de eventos con Abiertos, Cerrados y Todos.
- Los eventos pueden renombrarse sin cambiar su ID ni borrar información.
- En búsqueda/escaneo se agrega acceso a la credencial pública.
- Nuevo perfil **Operador de Eventos**, protegido también en servidor.

## Migración obligatoria

Antes del despliegue ejecute:

`database/update_v1.0.54_demo_feedback.sql`

El script solo modifica `chc_event_attendees` y, si era ENUM, amplía el campo `role` de `chc_admin_users`. No modifica `personal` ni `usuarios` del sistema de Incidencias.

## Despliegue

1. Respaldar la base de datos.
2. Ejecutar la migración anterior.
3. Desplegar todo el proyecto en Railway.
4. Conservar las variables de entorno actuales.
5. Crear un usuario con rol Operador de Eventos desde Administración de usuarios.
6. Probar cámara, asistencia, premio, exportación filtrada, reingreso y cierre de sesión.

## PWA y sincronización

Se conserva la PWA en modo network-only, la cámara, el lector QR alternativo, la consulta inmediata a MySQL en cada acción y la actualización visual cada 30 segundos.
