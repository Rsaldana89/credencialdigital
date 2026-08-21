# Credenciales Digitales QR CHC - v1.0.46

## Cambios

1. Al abrir `/admin/empleados` se revisan automáticamente los empleados activos sin QR.
2. Si nunca tuvieron QR, se crea uno.
3. Si ya tenían un QR histórico desactivado y volvieron a estar activos, se reactiva el mismo token.
4. La revisión se ejecuta antes de cargar la tabla para que el administrador vea el estado actualizado.
5. La operación usa `GET_LOCK` de MySQL para evitar generación duplicada cuando varios administradores consultan simultáneamente.
6. Las acciones manuales **Generar QR faltantes** y **Desactivar QR de inactivos** permanecen disponibles, pero ocultas en un desplegable **Opciones avanzadas** tanto en Panel como en Empleados.

## Base de datos

No se agregan tablas, columnas, índices ni procedimientos. No requiere ejecutar SQL.

## Nota

La desactivación de QR de empleados en Baja continúa siendo una acción manual dentro de Opciones avanzadas. La creación/reactivación de QR de empleados activos sí es automática al consultar Empleados.
