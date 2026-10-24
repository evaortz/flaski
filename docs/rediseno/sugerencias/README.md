# Batería de sugerencias (suggest.js)

Para cada apunte de ejemplo, en `esperadas/<apunte>.json`, están las preguntas que un buen sugeridor sin IA **debería** sacar.

## Cómo se mide

Se importa el apunte (el .md de `temas-ejemplo/`), se ejecuta `suggestCards` y se compara con las esperadas:

- **Acierto:** una sugerencia que pregunta lo mismo y tiene la misma respuesta (normalizando mayúsculas, tildes y puntuación). El tipo puede variar si `tipo_alt` lo permite.
- **Cobertura** = esperadas encontradas / esperadas. Se mide aparte para las `imprescindible` y para el total.
- **Ruido** = sugerencias que no casan con ninguna esperada y que una persona descartaría. Se revisan a mano la primera vez y se guardan en `ruido/<apunte>.json` para medirlas después.
- **Informe:** tabla por apunte con cobertura (imprescindibles), cobertura (total), ruido y lista de esperadas que faltan, agrupadas por `regla`.

El objetivo no es el 100 %: es que cada cambio en suggest.js suba la cobertura sin subir el ruido.

## Campos de cada pregunta esperada

| Campo | Qué es |
|---|---|
| `tipo` | Tipo de Flaski (`cloze`, `basic`, `number`, `choice`, `truefalse`, `match`, `steps`, `sort`, `explain`, `whatif`). |
| `tipo_alt` | Otros tipos que también valen. |
| `pregunta` | Anverso o frase con el hueco marcado con `{{ }}`. |
| `respuesta` | Lo que hay que saber. |
| `incorrectas` | Solo en `choice`: distractores buenos, sacados del propio apunte. |
| `regla` | Qué patrón del texto la delata (ver lista abajo). Sirve para saber qué regla falta o falla. |
| `prioridad` | `imprescindible` · `deseable` · `extra`. |
| `existe_hoy` | `true` si suggest.js ya tiene la regla; `false` si es una regla nueva. |

## Reglas (nombres usados en `regla`)

- `negrita` · lo marcado en negrita se convierte en hueco (existe).
- `definicion` · «Término: definición» o «X es…» (existe).
- `fecha` · año tras «en / desde…» (existe, solo años).
- `fecha_completa` · fechas con día y mes («6 de diciembre de 1978») (nueva).
- `lista_con_titulo` · lista presentada por un título o «:» (existe).
- `tabla` · una pregunta por fila (existe).
- `articulo` · «Artículo N · …» / «Art. N» → qué dice y qué artículo es (nueva).
- `cifra` · número con unidad o cuantificador («169 artículos», «tres reformas», «doble anchura») (nueva).
- `enumeracion_en_frase` · lista dentro de una frase («la libertad, la justicia, la igualdad y…») (nueva).
- `quien_hace_que` · «Corresponde a X…», «X tiene como misión…» (nueva).
- `distractores_del_apunte` · incorrectas sacadas de otras respuestas del mismo apunte (nueva).
- `pasos_numerados` · lista numerada que describe un proceso → ordenar (nueva).
- `causal` · «porque», «por eso», «hace que», «si… entonces» → Explícalo / ¿Qué pasaría si…? (nueva).
- `contraste` · «en vez de», «a diferencia de», «no es lo mismo que» (nueva).
- `autor_obra` · «X fue un psicólogo que, en 1885, publicó…» → quién / cuándo (nueva).
