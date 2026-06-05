# Patch: Kiara Volt for academy-1198-v3

## Назначение

Этот архив добавляет цельную папку:

```text
characters/kiara/
```

Киара нужна для 15 августа 1198 как поздний социальный след первого дня: не первый кадр, не центр стартовой сцены, а заметная курсантка социальной орбиты Академии и будущая соперница Ливии.

## Источники канона

Использовано:

```text
akira-academy-prequel/characters/main/kiara_volt.md
akira-academy-prequel/characters/character_id_index.md
akira-academy-prequel/gpt/locks/character_presence_rotation_lock.md
```

## Как загрузить

1. Распаковать архив в корень репозитория `academy-1198-v3`.
2. Разрешить замену файлов, если GitHub/система спросит.
3. Проверить, что появилась папка:

```text
characters/kiara/
```

4. Коммит:

```text
Add Kiara academy start card
```

## Важно по именам

В сцене использовать:

```text
Киара
```

Полное имя:

```text
Киара Вольт
```

только для идентификации, карточки, индекса или первого формального представления.

## Что должно быть уже в index

В `characters/characters_index.yaml` уже должно быть:

```yaml
char_kiara:
  folder: "characters/kiara/"
  main_file: "characters/kiara/character_card.yaml"
  aliases: ["Киара Вольт"]
  known_label: "Киара"
  unknown_label: "высокая светловолосая курсантка"
```

## Содержимое

```text
characters/kiara/character_card.yaml
characters/kiara/appearance.md
characters/kiara/behavior.md
characters/kiara/voice.md
characters/kiara/knowledge.yaml
characters/kiara/links.yaml
characters/kiara/energy.yaml
characters/kiara/goals.yaml
characters/kiara/habits.md
characters/kiara/past.md
```

## Проверка после загрузки

Поиск по репозиторию:

```text
Киара Вольт
char_kiara
beat_004_kiara_first_trace
```

Ожидаемо:
- полное имя встречается в карточках/индексе;
- в сценах и обычном тексте использовать короткое имя `Киара`;
- она не должна входить в первый кадр до Акиры и Ливии.
