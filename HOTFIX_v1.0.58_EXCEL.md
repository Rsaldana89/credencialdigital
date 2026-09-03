# Hotfix v1.0.58 - Exportación Excel

## Problema
Microsoft Excel mostraba que `/xl/worksheets/sheet1.xml` contenía un error XML y reparaba o eliminaba la hoja.

## Causa
La hoja XLSX se genera como OOXML. En la plantilla se escribía `mergeCells` antes de `autoFilter`. El esquema de Excel exige que `autoFilter` aparezca antes de `mergeCells`. El mensaje observado (línea 8, columna 0) coincide precisamente con la posición de `autoFilter` en la plantilla anterior.

Además se añadió sanitización de caracteres de control no permitidos en XML 1.0 para impedir que datos heredados de MySQL dañen un archivo futuro.

## Cambios
- `autoFilter` ahora se genera antes de `mergeCells`.
- Se agrega `dimension` a la hoja.
- Se eliminan/sustituyen caracteres XML 1.0 no válidos antes de escapar el texto.
- Aplica tanto a Excel completo como Excel filtrado porque ambos usan el mismo generador.

## Base de datos
No requiere SQL ni cambios de estructura.
