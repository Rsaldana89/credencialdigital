# Ajuste v1.0.63 - Paquete QR con ID visible

## Cambio solicitado

Se agrega en **Administración > Empleados** un nuevo botón **Descargar QR con ID**, colocado junto al botón existente **Descargar paquete QR**.

El botón original no cambia. La nueva descarga crea un ZIP independiente con todos los QR activos y, en cada PNG:

- conserva exactamente el QR de 800 x 800 px;
- agrega una franja blanca debajo del código;
- muestra el número de empleado centrado y separado visualmente del QR;
- completa números puramente numéricos a un mínimo de 5 dígitos, por ejemplo `4986` -> `04986`;
- genera archivos con formato `NUMERO_EMPLEADO_QR_ID.png`;
- mantiene el QR escaneable porque el código original no se redimensiona ni se altera.

El texto del ID se convierte a trazos SVG antes de renderizarse, evitando depender de las fuentes instaladas en Railway.

## Base de datos

No requiere cambios SQL ni nuevas variables de entorno.
