# Papelera y borrar la cuenta

Pantallas:
- `papelera-cuenta-movil.jpg`, de izquierda a derecha: borrar, aviso con Deshacer, papelera, recuperar, Ajustes › Datos, borrar la cuenta, cuenta borrada.
- `papelera-escritorio.jpg`.

En el lienzo están en «Papelera y borrar la cuenta».

## 1 · Borrar ya no es para siempre
- Las hojas de «Borrar lista», «Borrar apunte» y «Borrar carpeta» cambian el texto: «Va a la papelera con sus N preguntas y tu progreso. Durante 30 días puedes recuperarla tal cual; después se borra del todo.» El botón sigue rojo, «Borrar».
- Si la lista tiene un apunte unido, una nota en gris: «El apunte unido no se borra: se queda sin lista». Es lo mismo que pasa hoy.
- Una carpeta va a la papelera **entera**, con lo que tiene dentro, como un solo elemento.
- Al borrar sale un aviso oscuro abajo, «Lista en la papelera · Deshacer», durante 6 s, con una barrita que se acaba. «Deshacer» la deja exactamente donde estaba.
- Una pregunta suelta borrada en el editor o en la tanda no va a la papelera. Basta con el aviso «Deshacer» (6 s) que ya existe o que hay que añadir.

## 2 · La papelera
- Se llega desde dos sitios:
  - en Biblioteca, la píldora «Papelera · N» al final de los filtros, junto a «Archivadas», que solo sale si hay algo;
  - en Ajustes › Datos › «Abrir la papelera».
- Cada fila lleva el icono del tipo, apagado; el nombre; «lista · 20 preguntas · borrada hoy»; y una píldora con los días que quedan. La píldora va en rojo cuando quedan 3 días o menos.
- Botones: «Recuperar» (relleno) y «Borrar ya» (borde). «Borrar ya» y «Vaciar» piden confirmación: «Se borra del todo. No se puede deshacer.».
- Debajo, un aviso: las preguntas sueltas van con su lista, y la pregunta borrada desde la tanda o el editor solo se recupera con «Deshacer».
- Vacía: «La papelera está vacía. Lo que borres se queda aquí 30 días.».
- Escritorio: una tabla con Nombre, Borrado, Se borra en y los dos botones. «Vaciar la papelera» va arriba a la derecha.

## 3 · Recuperar
- Hoja «Recuperar «X»»:
  - lo que vuelve con ella, si es una carpeta (sus listas y apuntes);
  - un campo «Dónde», con la carpeta en la que estaba, o Biblioteca si ya no existe;
  - la nota «Tu progreso vuelve igual. Lo que tocaba repasar mientras estaba borrada sale ahora en Hoy.».
- Una lista sola se puede recuperar al momento, sin hoja. Sale el aviso «Recuperada en Biblioteca · Ver».
- Si al recuperar ya hay otra con el mismo nombre en ese sitio, se le añade «(recuperada)».

## 4 · Ajustes › Datos
- En orden: Copia de seguridad, Restaurar copia, **Papelera** («3 cosas · lo más antiguo se borra del todo en 3 días»), Reiniciar el progreso (en rojo, como ahora).
- Al final, una caja con borde rojo claro, «Borrar tu cuenta», con el texto de qué se borra y el botón rojo «Borrar mi cuenta…».
- En la versión con buscador de Ajustes, «borrar cuenta», «eliminar cuenta», «papelera» y «recuperar» la encuentran.

## 5 · Borrar tu cuenta (pantalla, no hoja)
Tres pasos numerados:
1. **Descarga tu copia.** El botón es el mismo que el de copia de seguridad. Al terminar se pone verde, «Descargada». No es obligatorio, pero el paso queda marcado.
2. **Esto es lo que se borra.** Una caja roja clara con los números reales: listas, apuntes, preguntas y su progreso, simulacros, racha y amigos. Debajo: las listas compartidas dejan de verse en Explorar y tus amigos dejan de ver tu racha.
3. **Escribe BORRAR para confirmar.** Da igual si va en mayúsculas o en minúsculas. Hasta que no esté escrito, el botón está apagado.

- Botón rojo grande: «Borrar mi cuenta para siempre». Debajo, «Mejor no, volver».
- Al terminar, una pantalla blanca con el logo de puntos en claro:
  - «Tu cuenta se ha borrado»;
  - «Te hemos enviado un correo a [su correo]…»;
  - el nombre del archivo de la copia;
  - «Cerrar», que lleva a la pantalla de entrar.
- En modo `?local` hace lo mismo con los datos de este navegador.

## Datos (sin tabla nueva si se puede)
- **Borrado suave:** `deleted_at` en las filas de listas, apuntes y carpetas, y filtrarlas en todas las consultas. Si eso necesita columnas en Supabase, dilo y espera mi OK.
  - Las preguntas de una lista borrada se quedan como están. No se ven porque su lista no se ve, y no entran en tandas, Hoy, Plan, mapa ni simulacros.
  - Al recuperar se quita `deleted_at`.
  - Se borra del todo pasados 30 días: al abrir la app se limpia lo caducado de ese usuario. No hace falta un trabajo en el servidor.
- **Borrar la cuenta:** necesita una función en el servidor (RPC o Edge Function) que borre las filas del usuario y su usuario de Auth. Escríbela, dime qué hay que ejecutar en Supabase y espera mi OK. El correo de constancia, si no hay forma de mandarlo ya, se queda fuera y se quita esa frase.
