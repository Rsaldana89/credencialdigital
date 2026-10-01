# Ajuste v1.0.65 - Paquete QR con nombre completo e ID

## Objetivo
Agregar una tercera modalidad de descarga masiva de QR en Administración > Empleados.

## Funciones de paquetes QR disponibles
1. Descargar paquete QR: QR limpio.
2. Descargar QR con ID: QR con número de empleado de 5 dígitos debajo.
3. Descargar QR con nombre: nombre completo arriba, QR al centro e ID de 5 dígitos abajo.

## Detalles técnicos
- Nuevo endpoint POST `/admin/empleados/descargar-qrs-con-nombre`.
- El nombre completo se centra y puede ocupar hasta 2 líneas.
- El ID mantiene 5 dígitos con ceros a la izquierda.
- Se conserva generación por streaming, lotes de 4 y ZIP sin recompresión para reducir CPU en Railway.
- No requiere cambios de base de datos.
