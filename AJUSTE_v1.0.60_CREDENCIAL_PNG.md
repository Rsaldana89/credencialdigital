# v1.0.60 - Credencial PNG legible en celulares

## Problema corregido
En Railway el PNG de la credencial se generaba con Sharp/libvips. Dependiendo de las fuentes instaladas en el contenedor Linux, los textos dinámicos de la persona trabajadora podían aparecer como cuadros, símbolos o quedar prácticamente ilegibles, aunque el QR, fotografía y elementos gráficos sí se mostraran correctamente.

## Solución
- El botón **Descargar credencial PNG** sigue utilizando el diseño generado por el servidor como base.
- Antes de guardar el archivo, Chrome repinta en un Canvas los datos dinámicos usando las fuentes disponibles en el propio dispositivo.
- Se repintan Nombre, número de empleado, puesto, fecha de ingreso/reingreso, antigüedad, NSS y la leyenda **QR ASOCIADO**.
- Se aumentó el tamaño de los valores para que sigan siendo legibles cuando la credencial se comparte por WhatsApp o Teams.
- Si Canvas no está disponible, se conserva como respaldo la descarga directa desde el servidor.
- El generador del servidor también usa una familia de fuentes Linux más compatible como segunda protección.

## No cambia
- QR ni token.
- Fotografía.
- Datos de la base.
- Eventos, asistencias o premios.
- PWA.
- Permisos.
- Estructura MySQL.

No requiere migración SQL.
