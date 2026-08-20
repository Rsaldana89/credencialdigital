# Cámara v1.0.41

Corrección adicional para el escáner QR de eventos.

## Problema encontrado
La cámara sí podía recibir permiso y abrir el stream, pero la capa visual de "Escáner QR" continuaba encima del elemento `<video>`. El CSS de `.event-camera-placeholder` usaba `display: grid`, lo que podía prevalecer sobre el atributo HTML `hidden`. Por eso parecía que la cámara nunca se encendía aunque Chrome ya hubiera concedido permiso e incluso permitiera cambiar de cámara.

## Cambios
- Se fuerza `display: none !important` cuando el placeholder tiene `hidden`.
- El JavaScript controla explícitamente la visibilidad de la capa del escáner.
- Se espera a que exista video real (`videoWidth`/`videoHeight`) antes de declarar la cámara lista.
- Se comprueba que la pista de cámara esté en estado `live`.
- Se muestra el nombre/resolución de la cámara activa en el mensaje de estado.
- Se mantienen `playsinline`, `muted` y autoplay para compatibilidad móvil.
- Se actualizó el cache-busting de scripts a v1.0.41.

No requiere cambios en la base de datos.
