# Perfil y Ajustes (fase 13, después de la 12)

## Perfil
- Cabecera: avatar, nombre con lápiz (editar el nombre se hace aquí, sin el bloque «Tu nombre»), racha con el icono
  de la app y comodines, y las 4 cifras.
- «Tu estudio»: Plan de estudio (con etiqueta de estado: «vas bien» / «no llegas»), Estadísticas, Amigos
  (nombres y etiqueta «N ánimos» si hay sin leer).
- «Flaski»: Ajustes, Novedades (con la versión), Ver la presentación.
- Cuenta: correo, Cambiar contraseña, Cerrar sesión.
- Créditos y licencias: pasan a un enlace pequeño al final (abre una hoja con el texto de ahora).

## Ajustes: qué se queda, qué se mueve
Pestañas: Apariencia · Tanda · Avisos · Idioma y voz · Hoy · Repaso · Datos.
- **Se va de Ajustes** (lo decide el Plan de estudio): duración de la tanda, preguntas nuevas al día,
  el enlace «Abrir el plan». En la sección Tanda queda una línea que enlaza al plan.
- **Repasos máximos y nuevas máximas** quedan como «Topes de seguridad» en Repaso (el plan los respeta).
- **Meta diaria** pasa a la pestaña Hoy (junto a qué bloques se ven en Hoy).
- **Orden de las nuevas y Mezcla** pasan a Tanda.
- **Tu idioma** pasa a «Idioma y voz».
- Quitar el enlace «Ver las últimas novedades» de la cabecera de Ajustes (ya está en Perfil).
- Móvil: botón de volver a Perfil.
- Datos: el texto de «Listas hechas con IA» dice «Mis listas → Pegar»; ahora es «Biblioteca › Importar › Pegar».
- Escritorio: índice de secciones a la izquierda (fijo) y contenido en una columna de ~680 px.

## Repaso de UX (v2)
- **Buscador** arriba de Ajustes (en escritorio, encima del índice). Busca en el título, la descripción y la
  pestaña de cada ajuste. Resultados: el ajuste con su control, ya usable, y encima la pestaña donde vive.
  Si se busca algo que se ha ido a otro sitio (duración de la tanda, nuevas al día), sale «Ya no está en
  Ajustes» con un enlace al Plan. Ver ajustes-buscar-movil.jpg.
- **Datos**: Reiniciar el progreso y Ajustes por defecto van aparte, en una caja «Con cuidado» (borde coral),
  con botón de verdad y confirmación. El resto de Datos queda arriba.
- **Perfil**: enlace «Ver tus estadísticas» bajo las 4 cifras.

## Color de acento
Solo cambia la lista y el aspecto de las bolitas; nada más. 9 colores en vez de 14:
Cobalto #2F3DB5 · Violeta #6338C2 · Ciruela #94307F · Frambuesa #BF2F5C · Teja #B4482A · Oliva #5A7420 ·
Bosque #1D7550 · Laguna #106E7C · Tinta #3B4157. Los ids antiguos se pasan al más parecido.
Bolitas de 52 px con brillo arriba y sombra abajo; la elegida lleva un círculo a mano y ✓ (ver ajustes-escritorio.jpg).

## Lo que hoy sale siempre en cobalto (bug)
Revisado en el código actual:
1. css/app.css `#selBar` (barra de «elegir varias»): fondo, texto y hover con #2F3DB5 / #EEEFFA a mano.
2. css/app.css `.fmt-more` (menú de formato del editor): fondo #2F3DB5 y sombra rgba(26,36,122,.3).
3. css/app.css `.hoy-act` (actividad de Hoy): la escala --a0..--a5 está escrita en azules.
4. img/iconos/racha.svg, comodin.svg, sugerencia.svg y los dibujos de img/carpetas: trazos #2F3DB5 / #1F2A8A
   dentro de un <img>, así que no pueden heredar el color. Hay que meterlos en línea (icons.js ya los genera) y
   cambiar ese azul por currentColor o var(--accent-ink). Los demás colores de los dibujos (coral, ámbar…) se quedan.
5. Modo oscuro: `:root[data-accent="blue"]{--accent:#2F3DB5}` va después del bloque oscuro y lo pisa, así que en
   oscuro el cobalto no se aclara (#4553C4). Solo marrón y gris tienen versión oscura. Cada acento necesita
   su versión algo más clara en oscuro.
6. Las capturas de la presentación y de Novedades (img/onboarding, img/novedades) son fotos en cobalto. Se pueden
   dejar así; no hace falta regenerarlas.
