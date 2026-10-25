# Novedades · vídeo del rediseño

Archivos:
- `flaski-lo-nuevo-720x1280.mp4`: el que va en la app (1,2 MB).
- `flaski-lo-nuevo-1080x1920.mp4`: en alta, para redes o la web.
- `portada.jpg`: primer fotograma con el logo y «Lo nuevo».

Dura 40 s, vertical y sin sonido. Va escena a escena: mapa de lo que sabes, repasar dentro del apunte, preguntas para entender, simulacro de examen, plan hasta el examen, colores y pegatinas, y Explorar.

## Cómo va en la app
- La primera vez que se abre la app después de actualizar, la hoja de Novedades lleva el vídeo arriba: `<video src="media/flaski-lo-nuevo-720x1280.mp4" poster="media/portada.jpg" muted playsinline loop autoplay>`, con un ancho máximo de 360 px y bordes redondeados de 24 px.
- Si el sistema tiene «reducir movimiento», no se reproduce solo: sale la portada con un botón ▶ «Ver el vídeo».
- Debajo del vídeo va la lista de novedades en texto (la misma que en el vídeo), para quien no lo vea.
- Botones: «Probar el simulacro» (abre el Plan) y «Cerrar».
- Copia el vídeo de 720 y la portada a `media/` y añádelos al service worker para que funcione sin conexión. Sube la versión de `sw.js`.
