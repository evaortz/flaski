# Datos de japonés (data/ja)

Los genera `tests/tools/ja_datos.py` a partir de:

- **KANJIDIC2** y **KRADFILE** (Electronic Dictionary Research and Development Group, EDRDG): https://www.edrdg.org/
- **JMdict** (EDRDG): https://www.edrdg.org/jmdict/j_jmdict.html
- **Kanjium** (entonación, `accents.txt`): https://github.com/mifunetoshiro/kanjium

Todos con licencia **Creative Commons Attribution-ShareAlike 4.0** (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/
Estos datos adaptados (`kanji.json` y `dic/`) se distribuyen con la misma licencia. La atribución está también en la app
(Perfil › Créditos y licencias).

## jlpt.json

Las palabras del N5 y del N4 del JLPT, con su significado. Las genera `tests/tools/jlpt.mjs` a partir de las listas de
**Jonathan Waller** (tanos.co.uk, Creative Commons BY), tomadas de https://github.com/stephenmk/yomitan-jlpt-vocab
(`original_data/n5.csv` y `n4.csv`, guardadas en `tests/tools/jlpt/`). El significado sale de JMdict (arriba); unas pocas
palabras sin español en JMdict van traducidas a mano. El JLPT no publica listas oficiales desde 2010: son orientativas.
