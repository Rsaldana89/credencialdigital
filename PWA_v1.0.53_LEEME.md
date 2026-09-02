# v1.0.54 - PWA instalable

Esta version agrega instalacion como Progressive Web App (PWA) sin modificar la logica de credenciales, usuarios, eventos, asistencia, premios, camara ni base de datos.

## Que se agrego

- `public/manifest.webmanifest` con nombre, colores, iconos, alcance y acceso directo a Panel/Eventos.
- Iconos PWA de 192 px, 512 px, 512 px maskable y Apple Touch Icon.
- `public/sw.js` registrado como service worker.
- `public/js/pwa.js` para registrar la PWA y mostrar el boton de instalacion cuando Chrome permite instalar.
- Boton **Instalar Credenciales Digitales** dentro de la pantalla de login cuando el navegador dispara `beforeinstallprompt`.
- Etiquetas PWA/Apple en el layout general.

## Seguridad y funcionamiento

El service worker trabaja de forma **network-only**. No guarda en cache:

- sesiones administrativas;
- tokens CSRF;
- eventos;
- asistencias;
- premios;
- datos de empleados;
- respuestas de MySQL.

Esto evita que instalar la PWA cambie la sincronizacion actual o muestre informacion vieja.

La camara conserva exactamente la misma logica y permisos: en Railway debe funcionar mediante HTTPS y el permiso se solicita al activar el escaner dentro de Eventos.

## Instalacion Android / Chrome

1. Abrir la URL de produccion en Chrome.
2. Entrar a `/admin/login`.
3. Si Chrome considera la app instalable, aparecera **Instalar Credenciales Digitales** en el login.
4. Tambien puede usarse el menu de Chrome > **Instalar aplicacion** o **Agregar a pantalla principal**.
5. Al abrir el icono, inicia en `/admin`: si existe sesion entra al Panel; si no, redirige al Login.

No requiere cambios SQL ni variables de entorno nuevas.
