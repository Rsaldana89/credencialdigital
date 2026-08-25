# Credenciales Digitales QR CHC - v1.0.47

## Filtro de antigüedad para eventos

En la pantalla de cada evento aparece un filtro desplegable llamado **Antigüedad**. Permite marcar uno o varios rangos:

- Menos de 5 años.
- 5 a 9 años.
- 10 a 14 años.
- 15 a 19 años.
- 20 a 24 años.
- 25 a 29 años.
- 30 años o más.

La lista, la búsqueda manual y el escáner usan los rangos seleccionados. Si se escanea una credencial válida de una persona invitada que está fuera del filtro, el sistema no registra su asistencia.

## Fecha usada para calcular la antigüedad

La antigüedad se calcula con la **fecha programada del evento**, usando la fecha de ingreso que quedó guardada en la lista de invitados.

Ejemplo para un evento del 10 de octubre de 2026:

- Ingreso 10/10/2021: el 10/10/2026 ya aparece con 5 años y entra en el rango **5 a 9 años**.
- Ingreso 11/10/2021: el 10/10/2026 todavía aparece con 4 años y 11 meses y permanece en **Menos de 5 años**.
- Ingreso 10/10/2016: el 10/10/2026 ya aparece con 10 años y entra en **10 a 14 años**.

Así se respeta el cambio de rango exactamente desde el día en que se cumple el aniversario laboral.

## Trabajo con varios dispositivos

El filtro se guarda por pestaña/dispositivo. Por ejemplo:

- Dispositivo 1: menos de 5 años y 5 a 9 años.
- Dispositivo 2: 10 a 14 años.
- Dispositivo 3: 15 años o más.

Cada escaneo consulta MySQL en ese momento y mantiene el bloqueo de fila para evitar asistencias o premios duplicados. La lista visual sigue sincronizándose cada 30 segundos.

## Exportaciones

- **Excel completo / PDF completo:** descargan todos los invitados del evento.
- **Excel del filtro / PDF del filtro:** descargan solamente los rangos marcados en ese dispositivo.

Los archivos incluyen la antigüedad exacta y el rango de antigüedad.

## Base de datos

Esta versión no cambia tablas, columnas ni índices. No es necesario ejecutar SQL adicional.
