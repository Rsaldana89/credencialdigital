# Credenciales Digitales QR CHC v1.0.40 - Correccion de camara

Esta version corrige el problema del modulo de Eventos donde la pagina podia mostrar que el navegador no tenia lector QR nativo **antes de solicitar permiso para usar la camara**.

## Cambios realizados

1. La aplicacion solicita acceso a la camara primero, mediante `navigator.mediaDevices.getUserMedia()`.
2. Si el navegador soporta `BarcodeDetector`, se usa el lector QR nativo.
3. Si `BarcodeDetector` no existe o no soporta QR, se usa `jsQR` como lector alterno en el navegador.
4. `jsQR` se instala como dependencia NPM y se sirve desde el mismo dominio (`/vendor/jsqr/jsQR.js`), por lo que no depende de un CDN externo en produccion.
5. Se agrego un segundo intento de apertura con restricciones de camara mas simples para equipos que rechazan `facingMode` o resoluciones ideales.
6. Despues de obtener permiso se enumeran las camaras. Si hay mas de una, aparece el boton **Cambiar camara**.
7. Los mensajes de error ahora distinguen permiso bloqueado, camara no encontrada y camara ocupada.
8. Se mantiene la politica `Permissions-Policy: camera=(self)` para las rutas `/admin/eventos`.

## Base de datos

**No requiere cambios de base de datos.** Se conserva el esquema del modulo de eventos v1.0.39.

## Despliegue en Railway

Sube/despliega esta version completa. `package.json` y `package-lock.json` ya incluyen `jsqr` 1.4.0, por lo que Railway debe instalarlo junto con las demas dependencias.

Despues del despliegue, haz una recarga completa del navegador para evitar que quede en cache el JavaScript anterior.

## Prueba recomendada

1. Abre un evento que este **Abierto**.
2. Pulsa **Activar camara**.
3. El navegador debe solicitar permiso si aun no lo tiene concedido.
4. Acepta el permiso.
5. Debe aparecer la imagen de la camara y el mensaje `Camara activa. Lector QR listo` o `Camara activa. Lector QR compatible listo`.
6. En celular, si se abre la camara frontal y hay mas de una disponible, pulsa **Cambiar camara**.
7. Escanea una credencial QR valida y confirma que se registra la asistencia.

Si el navegador ya tiene la camara configurada como **Bloqueada**, ningun sitio puede forzar que vuelva a aparecer el cuadro de permiso. En ese caso hay que cambiar el permiso de Camara desde el candado/ajustes del sitio y volver a pulsar **Activar camara**.
