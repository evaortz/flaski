# Rediseño de Flaski — lo decidido

Referencia visual: `pantallas/*.jpg`. Copiar lo que se ve; no rediseñar ni inventar funciones. Si algo no está aquí ni en las capturas, se pregunta, no se inventa.

## Idea
Flaski es gratis, de código abierto y sin ánimo de lucro, para gente con poco tiempo (estudiar en el transporte). La promesa es «tus apuntes saben lo que sabes»: apuntes y preguntas van juntos, y el progreso es real. Primer foco: oposiciones, sin dejar de servir para cualquier cosa. Sin IA en v1.

## Vocabulario (en toda la interfaz)
- mazo → **lista** («Mazo» solo al importar de Anki)
- tarjeta → **pregunta**
- sesión de estudio → **tanda**
- apuntes y listas viven juntos dentro de **carpetas**

## Navegación
4 pestañas: **Hoy · Biblioteca · Explorar · Perfil**.
- Biblioteca une lo que hoy son «Mis mazos» y «Apuntes».
- «Estudiar» desaparece como pestaña: se estudia desde Hoy o desde una carpeta o lista.
- Estadísticas, Plan, Ajustes y Amigos cuelgan de Perfil.
- Explorar es un extra (listas curadas).
- Móvil: barra inferior. Escritorio: barra lateral de 240px (`organizacion-*.jpg`, `hoy-escritorio.jpg`).

## Estilo
- Colores: cobalto `#2F3DB5`, oscuro `#1A247A`, medio `#5560C2`, suave `#8A90D4`, tenue `#C9CCF2`, fondo claro `#EEEFFA`, borde `#D5D7EE`.
- Letras: Gochi Hand para títulos y números grandes; Inter para el texto; Klee One para el japonés grande.
- Botón principal: cobalto con sombra `0 4px 0 #1A247A`.
- Las carpetas son azules, con un dibujo cartoon de colores asomando. Gustan mucho: se mantienen.
- Solo microcopy real y breve. Nada de textos explicativos de diseñador.
- Nada de emojis en la interfaz salvo los que elige la persona (icono de carpeta). Iconos de línea: Lucide, trazo 1,8. Propios a color: sugerencia, racha y comodín (`img/iconos/`; hoja en `pantallas/hoja-iconos.jpg`).

## Hoy (`hoy-movil.jpg`, `hoy-escritorio.jpg`)
De arriba abajo:
1. Saludo.
2. Número gigante de preguntas para hoy (Gochi 170px) con «preguntas!» girado, y botón «Empezar tanda».
3. **Lo que flojea**: filas con título, ruta y píldora de estado. Usar siempre ese nombre.
4. Tarjeta de examen o plan (fecha o «foco del mes»).
5. **Cómo va lo que sabes**: gráfico honesto de consolidadas / jóvenes / por aprender.
6. **Tu actividad**: mapa tipo GitHub con meta diaria.
   - Día sin estudio: blanco con borde 1px `#D5D7EE`.
   - Días con estudio: relleno sin borde `#B8BDE6 · #8C95E0 · #5560C2 · #2F3DB5 · #1A247A`.
   - Hoy lleva un anillo de 1.5px cobalto.
   - Los días futuros no se dibujan.
7. **Tus amigos**, AL FINAL: el último ánimo recibido, una fila de amigo con píldoras para animar y el enlace «Ver amigos».

## Tanda (`tanda-*.jpg`)
- Pantalla completa azul cobalto: cabecera con volver, nombre de la lista y «pregunta N de M»; barra de progreso por segmentos.
- **Memorizar** (cualquier tipo, una vez revelada o comprobada): 4 botones Otra vez `#FF9F92` · Difícil `#FFC36B` · Bien `#8EE3B5` · Fácil `#9ED4FF`, de 60px de alto y radio 30, con el intervalo debajo.
  - Si la app corrige sola (test, número), marca el resultado y pone un anillo en el botón sugerido.

## Preguntas de entender (nuevas; `entender-*.jpg`)
- **Explícalo con tus palabras**: modos Escribir · Dictar · Pensarlo. Después muestra las «ideas clave» sacadas del apunte.
- **¿Qué pasaría si…?**: escenario, respuesta libre y después ideas clave.
- Se cierran con 3 botones de la misma forma que los de memorizar: **Todavía no · A medias · Lo sé explicar** (coral, ámbar, menta).

## Editor de apuntes (`editor-*.jpg`)
- Barra de selección: B · I · U · S · código · A▾ | **＋ Crear pregunta** · Hueco.
  - Fondo cobalto `#2F3DB5`, iconos blancos, separadores `rgba(255,255,255,.25)`.
  - «Crear pregunta» es una píldora blanca con texto cobalto. «Hueco» va con borde blanco.
- Crear pregunta abre un panel lateral derecho (no un modal).
- En el margen de cada bloque, el estado de sus preguntas.

## Tipos de pregunta
Se mantienen TODOS los de `cardtypes.js`, sin cambiar la lógica. El selector de tipos se rediseñará aparte; hasta entonces no se toca.

## NO existe (no añadir)
- Dudas para una clase.
- Deberes de profesora.
- Calendario de clases.
- Sincronizar con Drive o Dropbox, e IA: más adelante, no ahora.

## Mapeo de entender → repaso
Todavía no = Otra vez · A medias = Difícil · Lo sé explicar = Bien.
