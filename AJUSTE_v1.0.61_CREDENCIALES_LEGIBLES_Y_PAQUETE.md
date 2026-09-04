# v1.0.61 - Credenciales PNG legibles + paquete masivo

## Problema corregido

En Railway, Sharp/libvips podía rasterizar los textos SVG con fuentes no disponibles y convertir letras en cuadros. La v1.0.60 intentaba repintar el texto en el navegador, pero algunos navegadores terminaban descargando el PNG del servidor sin esa reconstrucción.

## Solución

La credencial ya no depende de fuentes instaladas en Railway ni del navegador para sus textos. Los textos de la imagen se convierten a trazos vectoriales (`<path>`) antes de que Sharp genere el PNG.

Esto aplica a:

- Nombre del empleado.
- Número de empleado.
- Puesto.
- Fecha de ingreso o reingreso.
- Antigüedad.
- NSS.
- Leyenda `QR ASOCIADO`.

La descarga individual ahora usa directamente el PNG generado por el servidor, por lo que el mismo archivo funciona desde PC, celular, PWA, WhatsApp o Teams.

## Nuevo paquete de credenciales

En **Administración > Empleados** aparece, junto a **Descargar paquete QR**, el botón:

**Descargar paquete de credenciales**

Genera un ZIP con una credencial PNG para cada empleado activo con QR vigente. Antes de preparar el paquete se ejecuta la revisión de QR faltantes, igual que en el paquete de QR.

Los archivos se nombran con el formato:

`NUMERO_EMPLEADO_CREDENCIAL_QR.png`

El ZIP se genera por lotes pequeños y se transmite mientras se prepara para no mantener todas las imágenes en memoria al mismo tiempo.

## Base de datos

No requiere cambios SQL ni nuevas tablas/columnas.
