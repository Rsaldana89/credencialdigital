# Ajuste v1.0.64 - Optimización del paquete QR con ID

## Objetivo

Reducir el tiempo de espera y el consumo de CPU al usar **Descargar QR con ID**, especialmente con cientos de empleados activos en Railway.

## Cambios

- La respuesta ZIP se abre antes de generar el paquete completo.
- Los QR se generan en lotes de 4 y se agregan al ZIP conforme quedan listos.
- El ZIP usa `store: true`: no intenta recomprimir PNG ya comprimidos.
- Sharp genera la variante QR + ID con `compressionLevel: 4` en lugar de 9. Esto no cambia los píxeles visibles, el ID ni la capacidad de escaneo; solo cambia el esfuerzo de compresión.
- Si el cliente cierra o cancela la descarga, se aborta el ZIP y se deja de procesar el resto de empleados.
- Se mantiene el nombre `QRS_CON_ID_EMPLEADOS_ACTIVOS_FECHA.zip` y cada archivo conserva el formato `NUMERO_EMPLEADO_QR_ID.png`.
- El ID continúa centrado, separado del QR y con mínimo 5 dígitos.

## Compatibilidad

No hay cambios en base de datos, rutas públicas, variables de entorno ni en el botón de descarga QR normal.
