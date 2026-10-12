SEV APP
==================================
CÓMO INSTALAR EN IOS O ANDROID
---------------------------------------------------------------------------

La forma más simple:
1. Abrí la URL de GitHub (Chrome en Android, Safari en IOS): [https://batuque0.github.io/sev-app/](https://batuque0.github.io/SEVapp/)
2. Android: aparece un aviso para "Agregar a pantalla de inicio" (o lo hacés
   manualmente desde el menú ⋮ → Instalar app / Agregar a pantalla principal).
   IOS: tocá el botón Compartir (el cuadradito con la flecha) → "Agregar
   a pantalla de inicio".
8. Listo — queda como ícono, abre en pantalla completa, y funciona sin
   conexión de ahí en adelante.

QUÉ CONTIENE EL REPOSITORIO
-----------
- index.html         → la app entera (una sola página, no necesita internet para funcionar)
- manifest.json       → hace que se pueda "instalar" con ícono propio en el celular
- service-worker.js   → hace que funcione sin conexión después de la primera vez que se abre
- icons/              → íconos de la app

DÓNDE SE GUARDAN LOS DATOS DE LA APP
---------------------------
Los SEV que cargues NO se guardan como archivos sueltos en el celular. Se
guardan en una base de datos interna del navegador (IndexedDB y en supabase)
- Sobrevive a cerrar la app, apagar el celular, quedarte sin batería, etc.
- Funciona igual en Android e iOS.
- NO se puede "ver" como carpeta desde la app Archivos/Files del celular
  (esto es una restricción de seguridad de los navegadores, no de esta app:
  ninguna web app —de nadie— puede escribir carpetas sueltas en tu celular).
- Se guardan en supabase, en una cuenta gratuita para vinculación con SEVApp Desktop.

LIMITACIÓN A TENER EN CUENTA EN iOS
-------------------------------------
- iOS es más estricto con el almacenamiento de las apps web: si la app pasa
muchos días sin abrirse, Safari podría, en algunos casos, limpiar los datos
guardados. Por eso conviene exportar el backup .zip cada tanto (por ejemplo,
al final de cada campaña de campo) en vez de confiar en que quede guardado
para siempre solo adentro del celular.
- IOS además no permite llamar dos veces seguidas a la función GPS, por lo
que para medir el punto otra vez tenés que esperar un minutito :').
