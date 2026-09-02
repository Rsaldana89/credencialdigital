# v1.0.57 - Confirmación de asistencia y premios en celular

Esta versión corrige la operación móvil después de un escaneo.

## Cambios

- El resultado del último escaneo aparece en celular como una hoja inferior visible sobre la pantalla.
- La confirmación distingue claramente **ASISTENCIA REGISTRADA** y **ASISTENCIA YA REGISTRADA**.
- En eventos con premios, **Premio** y **Consolación** aparecen en esa misma hoja inmediatamente después de registrar la asistencia; no hace falta volver a escanear.
- El botón **Ver credencial** continúa disponible en el resultado.
- Se agregó una X para ocultar el resultado si se desea continuar viendo la cámara.
- El mismo QR tiene una pausa de 7 segundos antes de volver a procesarse, mientras que un QR diferente se lee inmediatamente. Esto da tiempo al operador para marcar el premio sin que el QR que sigue dentro del encuadre vuelva a dispararse.
- El visor de la cámara conserva su tamaño actual.
- No hay cambios de base de datos.

## Flujo esperado

1. Escanear QR.
2. Aparece de inmediato **ASISTENCIA REGISTRADA** o **ASISTENCIA YA REGISTRADA**.
3. Si el evento maneja premios y todavía no existe una entrega, aparecen **Marcar Premio** y **Marcar Consolación** en pantalla.
4. Al registrar uno, el resultado cambia a **PREMIO REGISTRADO** o **CONSOLACIÓN REGISTRADA** y se eliminan las acciones incompatibles.
5. Si el empleado ya tenía un premio, se conserva el modal grande de advertencia existente.

No requiere ejecutar SQL.
