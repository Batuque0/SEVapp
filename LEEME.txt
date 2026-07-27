SEV APP — CÓMO USAR ESTA CARPETA
==================================

QUÉ HAY ACÁ
-----------
index.html         → la app entera (una sola página, no necesita internet para funcionar)
manifest.json       → hace que se pueda "instalar" con ícono propio en el celular
service-worker.js   → hace que funcione sin conexión después de la primera vez que se abre
icons/              → íconos de la app

DÓNDE SE GUARDAN LOS DATOS
---------------------------
Los SEV que cargues NO se guardan como archivos sueltos en el celular. Se
guardan en una base de datos interna del navegador (IndexedDB), que:
- Sobrevive a cerrar la app, apagar el celular, quedarte sin batería, etc.
- Funciona igual en Android e iOS.
- NO se puede "ver" como carpeta desde la app Archivos/Files del celular
  (esto es una restricción de seguridad de los navegadores, no de esta app:
  ninguna web app —de nadie— puede escribir carpetas sueltas en tu celular).

Para tener un respaldo real, en archivos, que sí podés ver y compartir:
tocá "Exportar backup completo (.zip)" en la pantalla de inicio. Eso arma
un .zip de verdad con esta estructura, que baja a Descargas (Android) o
Archivos (iOS):

    datos_sevapp/
      2026-07-26/
        SEV-01.csv
        SEV-01.json
      2026-07-27/
        SEV-02.csv
        SEV-02.json
      resumen.csv

Guardá ese .zip en Drive, mandalo por mail, lo que prefieras — es tu backup.


CÓMO PROBARLO YA (rápido, sin hostear nada)
--------------------------------------------
Simplemente abrí index.html haciendo doble clic o desde el navegador del
celular. Funciona igual, guarda los datos, exporta el zip. Lo único que NO
vas a poder hacer así es "instalarla" con ícono propio en la pantalla de
inicio de forma prolija (ver abajo por qué).


CÓMO INSTALARLA DE VERDAD, CON ÍCONO PROPIO (recomendado para uso diario)
---------------------------------------------------------------------------
Para que el celular la deje "instalar" con ícono propio y pantalla completa
(sin la barra del navegador), estos archivos tienen que estar alojados en
una dirección web (http/https) — no alcanza con abrir el archivo local.
Esto es una regla de Android e iOS, no de esta app.

La forma más simple y gratuita es GitHub Pages:
1. Creá una cuenta gratis en github.com (si no tenés).
2. Creá un repositorio nuevo, público, por ejemplo "sev-app".
3. Subí estos 5 elementos (index.html, manifest.json, service-worker.js,
   la carpeta icons/) a la raíz del repositorio.
4. En el repositorio: Settings → Pages → Source: "main" branch, carpeta "/ (root)".
5. GitHub te da una URL tipo: https://tuusuario.github.io/sev-app/
6. Abrí esa URL en el celular (Chrome en Android, Safari en iPhone).
7. Android: aparece un aviso para "Agregar a pantalla de inicio" (o lo hacés
   manualmente desde el menú ⋮ → Instalar app / Agregar a pantalla principal).
   iPhone: tocá el botón Compartir (el cuadradito con la flecha) → "Agregar
   a pantalla de inicio".
8. Listo — queda como ícono, abre en pantalla completa, y funciona sin
   conexión de ahí en adelante.

Alternativas igual de válidas y gratis si preferís no usar GitHub:
Netlify (netlify.com, arrastrás la carpeta y listo) o Vercel (vercel.com).
Cualquiera de las tres sirve — avisame si querés que te guíe paso a paso
con alguna en particular.


LIMITACIÓN A TENER EN CUENTA EN iOS
-------------------------------------
iOS es más estricto con el almacenamiento de las apps web: si la app pasa
muchos días sin abrirse, Safari podría, en algunos casos, limpiar los datos
guardados. Por eso conviene exportar el backup .zip cada tanto (por ejemplo,
al final de cada campaña de campo) en vez de confiar en que quede guardado
para siempre solo adentro del celular.
