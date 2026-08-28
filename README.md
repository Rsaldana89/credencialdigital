## v1.0.50 - Tarjetas compactas en móvil

- Compacta la lista de asistentes en celular sin reducir el tamaño de los textos.
- Cada invitado se presenta en una tarjeta de dos columnas para aprovechar mejor el ancho y mostrar más personas en pantalla.
- Antigüedad y asistencia quedan alineadas en una misma franja; premios ocupa una franja propia solo cuando corresponde.
- Corrige el encimado del texto del filtro de antigüedad cuando el escáner está plegado en pantallas angostas.
- La vista de escritorio conserva su tabla actual.
- No requiere cambios de base de datos.

Ver `TARJETAS_MOVILES_v1.0.50_LEEME.md`.

## v1.0.49 - Nuevos ingresos en eventos ya creados

- Los eventos creados con **Todos los activos** ahora incluyen una sección plegable **Gestionar invitados** con el botón **Agregar nuevos ingresos**.
- Al actualizar, solo se agregan empleados actualmente activos que todavía no formen parte de la lista; nunca se borran invitados ni se modifican asistencias o premios existentes.
- Los eventos creados con **Selección manual** permiten agregar empleados activos por número, sin convertir el evento en una lista de todos los activos.
- La operación usa una transacción y bloqueo del evento para evitar duplicados si dos administradores actualizan al mismo tiempo.
- Después de agregar invitados se revisan QR faltantes/reingresos usando la misma lógica existente de credenciales.
- La sincronización entre dispositivos sigue cada 30 segundos; si otro equipo agregó invitados, la vista se recarga cuando no está escaneando, o al detener/ocultar el escáner si estaba activo.
- No requiere cambios de estructura ni scripts SQL.

Ver `INVITADOS_NUEVOS_v1.0.49_LEEME.md`.

## v1.0.48 - Interfaz plegable y reportes legibles

- Corrige el PDF de eventos para que el texto en español sea legible en Railway y en cualquier navegador/visor PDF.
- El PDF ahora indica lista completa o filtro de antigüedad y muestra totales, asistencia y premios.
- El Excel agrega encabezado con evento, alcance, filtro y fecha de referencia de antigüedad.
- El resumen de antigüedad ahora distingue claramente invitados mostrados y personas con asistencia.
- El escáner QR conserva su tamaño grande y posición fija, pero puede ocultarse para consultar búsqueda manual o lista.
- Al ocultar el escáner se pausa la cámara; al volver a mostrarlo se reanuda si estaba activa.
- No requiere cambios de base de datos.

Ver `INTERFAZ_REPORTES_v1.0.48_LEEME.md`.

## v1.0.47 - Filtro de antigüedad en asistencia a eventos

- La vista de cada evento incorpora un filtro desplegable **Antigüedad** con casillas para: menos de 5 años, 5 a 9, 10 a 14, 15 a 19, 20 a 24, 25 a 29 y 30 años o más.
- El filtro se guarda por pestaña/dispositivo para que varios operadores puedan trabajar al mismo tiempo con rangos distintos sin cambiar la lista de los demás.
- La antigüedad se calcula con la **fecha del evento**. Si una persona cumple 5, 10, 15, 20, 25 o 30 años exactamente el día del evento, desde ese mismo día entra en el nuevo rango; un día antes conserva el rango anterior.
- No se cambia la forma en que se crean los invitados: el filtro únicamente controla qué invitados se muestran y cuáles puede atender ese dispositivo.
- Cada escaneo continúa consultando MySQL inmediatamente. Si el QR es válido pero el invitado no pertenece a los rangos marcados, no se registra su asistencia y se informa que está fuera de la lista filtrada.
- La búsqueda manual, los botones de asistencia y la entrega de Premio/Consolación respetan el mismo filtro activo.
- Cada fila muestra siempre la antigüedad exacta, la fecha de ingreso y una etiqueta de color con el rango correspondiente.
- Se conservan **Excel completo/PDF completo** y se agregan **Excel del filtro/PDF del filtro**.
- Se mantiene la protección multidispositivo y la actualización automática cada 30 segundos.
- No requiere cambios de estructura ni scripts SQL adicionales.

## v1.0.46 - QR automáticos y opciones avanzadas

- Al entrar a **Admin > Empleados**, el sistema revisa empleados activos y crea automáticamente los QR que falten antes de mostrar la lista.
- Si un empleado vuelve a estar activo y ya tenía un QR histórico desactivado, se **reactiva el mismo QR** en lugar de generar otro.
- La generación automática usa un bloqueo lógico de MySQL para evitar duplicados si dos administradores abren la pantalla al mismo tiempo.
- **Generar QR faltantes** y **Desactivar QR de inactivos** quedaron ocultos dentro de **Opciones avanzadas**.
- No requiere cambios de estructura ni scripts SQL adicionales.

## Cambios de la versión 1.0.45

- Las horas automáticas de **asistencia** y **entrega de premios** que MySQL guarda en UTC ahora se muestran convertidas a `America/Mexico_City` (UTC-6 para la operación actual), sin cambiar la estructura ni reescribir los datos de la base.
- La corrección también se aplica a registros anteriores ya guardados en UTC, por ejemplo `21:51` se muestra como `15:51` en México.
- Excel y PDF usan la misma conversión de zona horaria para las horas de asistencia y entrega.
- La fecha programada del evento se conserva tal como fue capturada; no se desplaza seis horas.
- El visor de cámara/QR es considerablemente más grande en PC y celular y la guía central del QR es más visible.
- Se conserva la sincronización automática cada **30 segundos** y la consulta inmediata a MySQL en cada escaneo o entrega de premio.
- No requiere cambios SQL. La zona puede ajustarse opcionalmente con `EVENT_TIME_ZONE`; si no se define, se usa `America/Mexico_City`.

## Cambios de la versión 1.0.44

- La sincronización automática entre dispositivos se ejecuta cada **30 segundos** para reducir todavía más la carga continua sobre Railway y MySQL.
- Al escanear un QR **no se espera a la sincronización de 30 segundos**: el escaneo llama inmediatamente al servidor, consulta y bloquea la fila correspondiente en MySQL, y responde con el estado real de asistencia de ese empleado.
- Si otra persona ya registró la asistencia desde otro dispositivo, el segundo escaneo recibe de inmediato **“Este empleado ya tenía asistencia registrada”** y no duplica el registro.
- La entrega de Premio/Consolación continúa validándose directamente contra MySQL en el momento de pulsar el botón, con bloqueo de fila para evitar dobles entregas.
- Se conserva una sincronización inicial al abrir la pantalla y actualizaciones puntuales después de las acciones del propio dispositivo.
- No requiere cambios en la estructura de MySQL.

## Cambios de la versión 1.0.43

- Los eventos **General** vuelven a mostrarse sin sugerencias ni botones para activar premios.
- Se conservan los botones **Exportar Excel** y **Exportar PDF** en la vista del evento, tanto en PC como en celular. Ambos exportan la lista completa del evento; en Fiesta con Premios incluyen asistencia y entregas de Premio/Consolación.
- Se agregó sincronización automática entre dispositivos usando los registros del evento. La lista, los contadores y el empleado escaneado se actualizan cuando otro dispositivo registra asistencia o entrega un premio.
- El registro de asistencia y la entrega de premios usan bloqueo de fila en MySQL para que dos o tres dispositivos puedan trabajar al mismo tiempo sin duplicar la misma operación sobre una persona.
- Si dos dispositivos intentan entregar un premio al mismo empleado, el segundo recibe el estado real almacenado en la base de datos y actualiza sus botones sin necesitar recargar manualmente.
- No requiere cambios en la estructura de MySQL. Usa las tablas del módulo de eventos ya creadas en v1.0.39.

## Cambios de la versión 1.0.38

- El inicio de sesión ahora admite el usuario administrativo principal y dos usuarios adicionales de Capital Humano.
- Los usuarios adicionales se configuran exclusivamente mediante variables de entorno; las contraseñas no se guardan en el código ni en GitHub.
- Se registra en la sesión el nombre del usuario que realizó cada carga individual o masiva de fotografías.
- Los tres usuarios conservan actualmente los mismos permisos dentro del panel administrativo.
- No se modifican tokens QR, fotografías, tablas ni procedimientos de MySQL.

## v1.0.35 - textos más legibles y QR ampliado

- Se incrementó ligeramente el tamaño de las etiquetas y valores de los campos de la credencial.
- El código QR ahora ocupa una mayor proporción del recuadro blanco, conservando el margen necesario para que siga siendo fácil de escanear.
- Los mismos ajustes se aplicaron tanto a la vista pública HTML como al PNG descargable.
- No requiere cambios en MySQL y no modifica ni regenera los tokens QR existentes.


## Cambios de la version 1.0.37

- El numero de empleado se presenta con un minimo de cinco digitos en la credencial: `4886` se muestra como `04886`.
- La importacion masiva acepta indistintamente `4886.jpg` o `04886.jpg` y guarda la foto usando el numero real almacenado en `personal`.
- Los bloques `Activo` y `Fecha de consulta` ahora tienen texto centrado y una fuente ligeramente mayor.
- No se modifican tokens QR ni se requiere una migracion de base de datos.

## v1.0.33 - credencial en vista limpia

- La credencial pública se muestra sin el encabezado ni el pie de página del sistema.
- Al abrirla desde el detalle de un empleado en Administración, se abre en una pestaña o ventana nueva.
- El panel administrativo conserva su encabezado, navegación y pie de página.

## v1.0.32 - foto pegada al aro dorado

Se eliminó el espacio blanco entre la fotografía y el aro dorado del marco de la foto.
- En la vista HTML/CSS ya no existe el aro blanco interior.
- En la generación PNG también se retiró el aro blanco interior y la foto ahora toca visualmente el borde dorado.

# Ajuste v1.0.31

- La fotografía se bajó y redujo ligeramente para dejar visible la palabra **Cremería**.
- La franja diagonal dorada y el borde inferior de la zona vino ahora comparten exactamente la misma pendiente, sin dejar una cuña oscura por debajo.
- Los mismos cambios se aplicaron a la credencial PNG descargable.

# v1.0.30 — credencial reconstruida en HTML/CSS

Esta versión deja de usar una credencial completa como imagen de fondo. La estructura de la tarjeta, la diagonal, el marco de la foto, los campos, los iconos y el panel QR se construyen con HTML/CSS. Para respetar las tipografías corporativas se conservan únicamente dos artes limpias: el logotipo superior y el lema inferior.

## Archivos principales del diseño

- `views/credential.ejs`: estructura HTML de la credencial.
- `public/css/credential-v30.css`: posiciones, tamaños, colores y responsividad.
- `public/img/logo-corporativo-v30.png`: arte corporativo superior.
- `public/img/frase-corporativa-v30.png`: lema corporativo inferior.
- `services/credentialImageService.js`: genera el PNG descargable con el mismo diseño.
- `controllers/publicController.js`: carga los recursos y datos dinámicos.

## Ajustes manuales rápidos

En `public/css/credential-v30.css`:

- `.chc30-logo-art`: posición y tamaño del logotipo.
- `.chc30-photo-frame`: posición y tamaño del marco de la foto.
- `.chc30-photo`: `object-position` para reencuadrar la cara sin deformar la imagen.
- `.chc30-fields`: posición general de los campos.
- `.chc30-qr-panel`: posición y tamaño del QR.
- `.chc30-footer`: tamaño de la franja inferior.

En `services/credentialImageService.js`, los valores equivalentes están en los elementos SVG del logotipo, la foto, los campos y el QR.

# Credenciales Digitales QR CHC

Aplicación web independiente para consultar identificaciones digitales de empleados de Cremería Hermanos Coronel mediante códigos QR.

La aplicación consulta la tabla existente `personal`, pero **no la modifica**. La credencial muestra el NSS junto con los datos laborales del empleado. RFC, CURP, correo y fecha de nacimiento no se muestran.

## Requisitos

- Node.js 20 o superior.
- MySQL 8.
- Una base de datos que contenga la tabla `personal` y los campos indicados en el requerimiento.
- MySQL Workbench, consola MySQL u otra herramienta para ejecutar el script SQL.

## 1. Instalar dependencias

Descomprime el proyecto, abre una terminal dentro de la carpeta y ejecuta:

```bash
npm install
```

## 2. Crear tablas, vistas y procedimientos

### Base local `sistema_gestion`

1. Abre MySQL Workbench.
2. Conéctate a tu servidor local.
3. Abre el archivo `database/schema_local.sql`.
4. Ejecuta todo el script.

El archivo inicia con:

```sql
USE sistema_gestion;
```

### Otra base de datos

Selecciona primero la base correcta y ejecuta `database/schema.sql`, o cambia la línea `USE` de `schema_local.sql`.

El script crea:

- `employee_qr_tokens`
- `employee_photos`
- `employee_qr_access_logs`
- `vw_qr_employees_active`
- `vw_qr_public_card`
- `sp_generate_missing_employee_qr_tokens`
- `sp_deactivate_qr_for_inactive_employees`

No crea, altera ni elimina la tabla `personal`.


## Actualización limpia de collations para instalaciones anteriores

Si ya ejecutaste las versiones 1.0.1 o 1.0.2, usa exclusivamente:

```text
database/update_v1.0.6_active_department.sql
```

Pasos:

1. Conserva tu archivo `.env`.
2. Sustituye los archivos del proyecto por los de esta versión 1.0.6.
3. Ejecuta completo `database/update_v1.0.6_active_department.sql` en MySQL Workbench.
4. Reinicia la aplicación con `npm run dev`.

La actualización v1.0.6 corrige `employee_qr_access_logs.access_result` y aplica la regla real de CHC: un empleado está activo cuando `department_name` es distinto de `Baja`. `fecha_baja` se conserva como historial, pero no determina la vigencia. También conserva compatibilidad con tokens heredados que tengan mayúsculas, UUID u otro formato URL-safe.

### Actualización v1.0.9: descarga individual y paquete de QR

La versión 1.0.9 corrige la descarga individual cuando `personal.employee_number` es numérico. Cada archivo se descarga con el formato `NUMERO_EMPLEADO_QR.png`. En la pantalla **Empleados activos** se agregó un botón **Descargar QR** antes de **Ver detalle**, además del botón **Descargar paquete QR**, que genera los QR faltantes y descarga un ZIP con todos los QR de empleados activos.

No requiere cambios adicionales en la base de datos.

### Actualización v1.0.8: mostrar NSS

Esta versión consulta `personal.nss` y lo muestra tanto en el detalle administrativo como en la credencial pública. También elimina la leyenda anterior de datos no consultados. Para actualizar las vistas de una instalación existente puedes ejecutar `database/update_v1.0.8_show_nss.sql`; la aplicación funciona directamente con la columna `personal.nss`.

No modifica `personal`, no elimina fotografías, no elimina tokens y no genera QR automáticamente. Los QR faltantes se generan desde el botón del panel administrativo.

## 3. Configurar `.env`

Copia `.env.example` con el nombre `.env`:

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

En CMD:

```cmd
copy .env.example .env
```

Edita únicamente los valores necesarios:

```env
PORT=3000
APP_URL=http://localhost:3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=sistema_gestion

ADMIN_USER=admin
ADMIN_PASSWORD=admin123

CAPITAL_HUMANO_1_USER=capitalhumano1
CAPITAL_HUMANO_1_PASSWORD=colocar_en_railway
CAPITAL_HUMANO_2_USER=capitalhumano2
CAPITAL_HUMANO_2_PASSWORD=colocar_en_railway

SESSION_SECRET=cambiar_esto_por_una_clave_segura
```

Usa una contraseña administrativa y un `SESSION_SECRET` seguros antes de publicar la aplicación.

## 4. Ejecutar en local

Modo desarrollo:

```bash
npm run dev
```

Modo normal:

```bash
npm start
```

Abre:

```text
http://localhost:3000
```

El servidor muestra en la consola si la conexión con MySQL fue correcta.

## 5. Entrar al panel administrativo

Abre:

```text
http://localhost:3000/admin/login
```

Usa `ADMIN_USER` y `ADMIN_PASSWORD` para la cuenta principal. También puedes configurar `CAPITAL_HUMANO_1_USER`, `CAPITAL_HUMANO_1_PASSWORD`, `CAPITAL_HUMANO_2_USER` y `CAPITAL_HUMANO_2_PASSWORD` para dos cuentas adicionales.

En un archivo `.env` local, una contraseña que contenga `#` debe escribirse entre comillas, por ejemplo: `CAPITAL_HUMANO_1_PASSWORD="una_clave_con_#"`. En Railway se captura el valor directamente en el campo de la variable.

Todas las rutas administrativas están protegidas mediante sesión. Los formularios administrativos también incluyen validación CSRF.

## 6. Generar los QR iniciales

Desde el panel administrativo:

1. Entra a **Panel**.
2. Presiona **Generar QR faltantes**.
3. El procedimiento genera un token aleatorio de 64 caracteres para cada empleado activo sin QR.

También puedes entrar al detalle de un empleado y generar su QR individualmente.

Un QR contiene únicamente una URL similar a:

```text
http://localhost:3000/e/0123456789abcdef...
```

El token no contiene RFC, CURP, NSS, nombre ni número de empleado; únicamente sirve para consultar los datos vigentes desde el sistema.

## 7. Subir fotografías

1. Abre **Empleados**.
2. Selecciona **Ver detalle**.
3. Elige una foto JPG, JPEG o PNG de máximo 5 MB.
4. Presiona **Guardar fotografía**.

La aplicación valida la imagen con `sharp`, corrige la orientación y la convierte a JPG de 300×400 px con calidad aproximada de 80%.

La foto normalizada se guarda en `employee_photos.photo_blob`. La tabla `personal` permanece sin cambios.

Si un empleado no tiene foto, se muestra la imagen placeholder incluida en `public/img/photo-placeholder.png`.

## 8. Probar una credencial pública

En el detalle del empleado:

1. Genera su QR si todavía no existe.
2. Presiona **Abrir credencial** o escanea el QR.
3. Comprueba que aparezcan foto, nombre, número, puesto, departamento, fecha de ingreso y estatus activo.
4. Presiona **Descargar PNG** para obtener el QR como imagen con el nombre `NUMERO_EMPLEADO_QR.png`.

También puedes descargar un QR directamente desde la lista **Empleados activos** o usar **Descargar paquete QR** para obtener un archivo ZIP con todos los QR activos.

Cuando `department_name` es `Baja` (sin importar mayúsculas, minúsculas o espacios), la ruta pública deja de mostrar información y responde:

- “Identificación no vigente”
- “Empleado no encontrado o dado de baja.”

Ejecuta **Desactivar QR de bajas** para marcar esos tokens como revocados. La aplicación consulta el departamento en cada acceso, por lo que la identificación se bloquea desde el momento en que el empleado pasa a `Baja`.

## 9. Desplegar posteriormente en Railway

1. Sube el proyecto a un repositorio Git.
2. Crea un servicio Node.js desde el repositorio.
3. Configura las variables de `.env` en la sección de variables del servicio.
4. Cambia `APP_URL` por la URL pública HTTPS asignada al servicio.
5. Configura `NODE_ENV=production`.
6. Verifica que el servidor MySQL permita conexiones desde el servicio y que el usuario tenga permisos de lectura sobre `personal` y permisos sobre las tres tablas nuevas, vistas y procedimientos.
7. Usa `npm start` como comando de inicio.
8. Comprueba el endpoint `/health`.

Para una publicación con varias instancias o reinicios frecuentes, conviene sustituir el almacén de sesión en memoria por uno persistente compatible con Express Session.

## Rutas principales

### Públicas

- `GET /`
- `GET /e/:token`
- `GET /e/:token/foto`
- `GET /e/:token/credencial.png`
- `GET /health`

### Administrativas

- `GET /admin/login`
- `POST /admin/login`
- `GET /admin/logout`
- `GET /admin`
- `GET /admin/empleados`
- `GET /admin/empleados/:employee_number`
- `GET /admin/empleados/:employee_number/foto`
- `POST /admin/empleados/:employee_number/foto`
- `POST /admin/generar-qr`
- `POST /admin/desactivar-bajas`
- `GET /admin/empleados/:employee_number/qr.png`
- `POST /admin/empleados/descargar-qrs`

## Seguridad incluida

- Consultas preparadas con `mysql2`.
- Tokens aleatorios de 32 bytes, representados como 64 caracteres hexadecimales.
- El número de empleado no se usa como identificador de la URL pública.
- Validación estricta de tokens y números de empleado.
- Restricción de imágenes a JPG/JPEG/PNG y máximo 5 MB.
- Normalización real de la imagen con `sharp`.
- Cookies de sesión `httpOnly` y `sameSite=lax`.
- Formularios protegidos con token CSRF.
- Encabezados básicos de seguridad y política CSP.
- Registro de accesos válidos e inválidos en `employee_qr_access_logs`.
- Ninguna operación de escritura sobre `personal`.

## Solución de problemas de npm

Si `npm install` termina con el mensaje **Exit handler never called**, cierre VS Code, vuelva a abrir una terminal PowerShell como usuario normal y ejecute dentro del proyecto:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm cache verify
npm config set registry https://registry.npmjs.org/
npm install
```

También confirme las versiones instaladas:

```powershell
node -v
npm -v
```

Se requiere Node.js 20.9 o posterior. Se recomienda usar una versión LTS de Node.js.


## Corrección v1.0.6: vigencia por departamento Baja

Para una instalación que ya tiene tablas y QR, ejecuta una sola vez:

```text
database/update_v1.0.6_active_department.sql
```

Después sustituye los archivos de la aplicación por los de esta versión y conserva tu `.env`. La actualización:

- No modifica `personal`.
- No cambia los tokens impresos o descargados.
- Reactiva únicamente QR desactivados por la regla anterior de `fecha_baja`, siempre que el empleado no esté en `Baja`.
- No reactiva QR revocados manualmente.
- Corrige `access_result` para evitar truncamientos.
- Actualiza solamente las dos vistas y los dos procedimientos del módulo QR.

La aplicación también detecta columnas `access_result` heredadas tipo `ENUM` y utiliza un valor compatible, de modo que un fallo de bitácora nunca bloquea una credencial válida.

## Actualización 1.0.7

- Se sustituyó el logotipo provisional por el logotipo oficial de Cremería Hermanos Coronel.
- El logotipo se muestra completo, sin deformación, en la credencial pública y en el encabezado del sistema.


## Correcciones de la versión 1.0.10

- Corrige la carga de fotografías con formularios `multipart/form-data`.
- Multer procesa primero el archivo y los campos del formulario; después se valida el token CSRF.
- Evita el mensaje incorrecto «La sesión del formulario expiró» al guardar una fotografía válida.

## Actualización 1.0.11: QR, fecha y descarga de la credencial

- Se eliminó la leyenda inferior «Esta identificación es válida únicamente…».
- La credencial pública ahora muestra su propio código QR de verificación.
- Se muestra la fecha y hora de consulta usando la zona horaria de México.
- Se agregó el botón **Descargar credencial PNG**. El archivo se nombra `NUMERO_EMPLEADO_CREDENCIAL_QR.png`.
- Se agregó el botón **Imprimir o guardar PDF**, que abre el cuadro de impresión del navegador.
- La versión para impresión oculta encabezado, pie de página y botones.
- No requiere cambios en MySQL y conserva los QR y fotografías existentes.

Nueva ruta pública:

```text
GET /e/:token/credencial.png
```


## Ajuste manual fino de la foto

### Vista web (pantalla)
Edita `public/css/styles.css` en el bloque `v1.0.24+`:
- `--photo-left`: mueve la foto a izquierda/derecha.
- `--photo-top`: mueve la foto arriba/abajo.
- `--photo-width`: hace la foto más ancha o más chica.
- `--photo-height`: hace la foto más alta o más chica.
- `--photo-pos-x` y `--photo-pos-y`: reencuadran la foto dentro del área sin deformarla.

### PNG descargado
Edita `services/credentialImageService.js`:
- `PHOTO_X`, `PHOTO_Y`
- `PHOTO_WIDTH`, `PHOTO_HEIGHT`
- `PHOTO_POSITION`

Sugerencia: mueve de 2 en 2 px en PNG y de 0.1% en 0.1% en CSS.

## v1.0.34 — Importación masiva de fotografías

Se agregó al panel administrativo el módulo:

```text
Administración → Fotografías → Importación masiva
```

### Preparación del ZIP

Cada imagen debe llamarse exactamente como el número de empleado:

```text
10733.jpg
4886.jpeg
11815.png
```

Formatos permitidos: JPG, JPEG y PNG.

El sistema:

1. valida que el número exista en `personal`;
2. procesa una fotografía a la vez;
3. corrige la orientación;
4. normaliza a 300 × 400 px en JPG;
5. inserta o reemplaza en `employee_photos`;
6. elimina el ZIP temporal;
7. genera un reporte visual y un CSV descargable.

Puede elegirse entre:

- reemplazar fotografías existentes;
- omitir empleados que ya tienen fotografía.

Para cargas grandes se recomiendan lotes de aproximadamente 200 fotografías.

### Seguridad y límites

La lectura del ZIP se realiza sin extraer archivos al sistema de carpetas. Se rechazan ZIP cifrados, ZIP64, archivos dañados, métodos de compresión no compatibles, imágenes demasiado grandes y lotes que excedan los límites configurados.

Las variables opcionales están documentadas en `.env.example`.

### Base de datos y QR

Esta versión no requiere cambios adicionales en la base de datos y no modifica `employee_qr_tokens`. La importación masiva sólo consulta `personal` y escribe en `employee_photos`.
