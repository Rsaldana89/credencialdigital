# v1.0.49 - Nuevos ingresos en eventos ya creados

## Objetivo
Permitir actualizar una lista de evento ya creada sin perder ni modificar asistencias o premios existentes.

## Eventos creados con "Todos los activos"
En la vista del evento abre **Gestionar invitados** y usa **Agregar nuevos ingresos**.
El sistema compara la lista del evento contra `personal` y agrega solo empleados actualmente activos que todavía no estén invitados.

## Eventos creados con selección manual
La misma sección permite capturar uno o varios números de empleado. Solo se agregan empleados activos y no se convierte el evento en una lista de todos los activos.

## Seguridad de datos
- No borra invitados existentes.
- No modifica asistencia, premio o consolación ya registrados.
- Usa la restricción única existente `(event_id, employee_number)` y un bloqueo transaccional del evento para evitar duplicados si dos administradores actualizan al mismo tiempo.
- Los datos del nuevo invitado se guardan como snapshot igual que al crear el evento.
- No requiere cambios de estructura ni scripts SQL.

## QR
Después de agregar invitados se ejecuta la revisión normal de QR faltantes de empleados activos. Los QR históricos se reactivan cuando corresponde y los ya existentes no cambian.

## Multidispositivo
La sincronización continúa cada 30 segundos. Si otro dispositivo detecta que aumentó el total de invitados, recarga la lista cuando no está escaneando. Si la cámara está activa, permite continuar escaneando y difiere la recarga hasta ocultar o detener el escáner.
