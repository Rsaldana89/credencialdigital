# Credenciales Digitales QR CHC v1.0.59

Ajustes finales solicitados:

1. La imagen PNG descargable de la credencial ahora contiene únicamente la credencial. Se eliminó del archivo descargado la franja inferior de `Activo` y `Fecha de consulta`. La consulta web conserva su estado de vigencia fuera de la imagen.
2. La búsqueda de empleados activos acepta números con o sin ceros a la izquierda. Ejemplo: `01310` y `1310` se consideran el mismo número para búsqueda, sin alterar el valor real almacenado en `personal.employee_number`.
3. El detalle administrativo también incorpora una búsqueda numérica de respaldo si se accede con un número equivalente sin los ceros iniciales.
4. El selector de empleados al crear eventos aplica la misma equivalencia numérica.

No requiere migración SQL ni cambios de estructura en la base de datos.
