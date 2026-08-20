# Credenciales Digitales QR CHC v1.0.42

## Cambios principales

1. Sonido al reconocer un QR.
   - Asistencia nueva: tono corto.
   - Reescaneo de alguien que ya asistió: doble tono.
   - Error/QR inválido: tono grave.
   - Premio registrado: tono de confirmación.
   - En celulares también conserva vibración cuando el navegador lo permite.

2. Acciones rápidas de premio después de escanear.
   - Si el empleado ya tiene asistencia y aún no tiene premio, aparecen los botones **Marcar Premio** y **Marcar Consolación** directamente bajo sus datos.
   - Esto también ocurre al volver a escanear a una persona que ya tenía asistencia.
   - Al registrar una opción, la otra queda bloqueada por la lógica existente de base de datos.

3. Eventos creados como General.
   - Un evento General no permite premios por diseño.
   - Ahora, en la parte superior del evento aparece **Activar premios**.
   - El botón convierte ese mismo evento a **Fiesta con Premios**, sin recrear invitados ni perder asistencias.
   - No requiere cambios de estructura en la base de datos.

## Para el evento #1 actual

Si fue creado como General, abre el evento y pulsa una sola vez **Activar premios**. Después, cada QR escaneado mostrará las acciones de Premio/Consolación cuando correspondan.
