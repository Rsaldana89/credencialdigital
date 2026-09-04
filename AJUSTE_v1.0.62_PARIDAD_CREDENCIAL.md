# v1.0.62 - Descarga alineada a la credencial web

Se conserva intacta la credencial que se renderiza en el navegador y se corrige únicamente el generador PNG.

## Qué se corrigió
- La descarga usa las mismas proporciones de `credential-v30.css` para campos, filas, iconos, textos, QR y separadores.
- Los iconos bajan a 74 px, que es el `max-width` real de la vista web.
- Etiquetas, valores y antigüedad usan tamaños equivalentes a 2.38cqw, 2.17cqw y 1.52cqw respectivamente; se elimina el efecto de zoom de la descarga anterior.
- La fecha y la antigüedad vuelven a ser dos líneas independientes, igual que en navegador.
- La foto usa un solo recorte `cover` con la equivalencia de `object-position: 50% 38%`, evitando el pequeño zoom adicional de versiones previas.
- El QR mantiene prácticamente el mismo tamaño, pero su panel respeta las proporciones exactas de la vista web.
- El paquete masivo reutiliza este mismo generador, por lo que todas las credenciales descargadas conservan la corrección.

No requiere cambios SQL.
