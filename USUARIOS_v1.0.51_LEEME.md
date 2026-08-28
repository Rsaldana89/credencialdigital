# v1.0.51 - Usuarios en MySQL y cierre de sesión visible

## Qué cambia

- Se agrega un botón **Cerrar sesión** siempre visible en el encabezado cuando existe una sesión administrativa.
- En celular aparece antes de la navegación horizontal para que no quede oculto fuera de pantalla.
- Se agrega **Admin > Usuarios** para crear y administrar usuarios de la aplicación.
- Las contraseñas se guardan en `chc_admin_users` mediante hash `scrypt` con salt aleatorio. No se guardan contraseñas en texto plano.
- Roles disponibles:
  - `admin`: acceso general y administración de usuarios.
  - `capital_humano`: acceso a credenciales, empleados, fotografías y eventos, pero no a administración de usuarios.
- Los usuarios se pueden activar/desactivar sin eliminarlos y se puede cambiar su contraseña.
- La aplicación evita desactivar al último administrador activo y evita que un administrador se desactive o cambie su propio rol desde el panel.

## Migración de los usuarios que ya están en Railway

Al iniciar esta versión, si `chc_admin_users` está vacía, la aplicación toma una sola vez los usuarios existentes de estas variables:

- `ADMIN_USER` / `ADMIN_PASSWORD`
- `CAPITAL_HUMANO_1_USER` / `CAPITAL_HUMANO_1_PASSWORD`
- `CAPITAL_HUMANO_2_USER` / `CAPITAL_HUMANO_2_PASSWORD`

Los importa a MySQL con contraseña hasheada. Después de que exista al menos un usuario en la tabla, las variables dejan de usarse para crear o autenticar usuarios.

Esto permite conservar los accesos actuales durante la transición y después administrar todo desde la aplicación.

## Base de datos

La aplicación ejecuta automáticamente `CREATE TABLE IF NOT EXISTS chc_admin_users` al iniciar. También se incluye el script manual:

`database/update_v1.0.51_admin_users.sql`

El script no modifica `personal`, credenciales, fotografías ni eventos.
