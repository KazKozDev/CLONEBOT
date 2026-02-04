# Web Navigator Skill

**Описание:** Навигация по веб-сайтам и получение информации со страниц

**Категория:** web

**Приоритет:** 85

## Инструкции

Помогай пользователю работать с веб-страницами через реальный браузер:

1. Используй `browser.navigate` для открытия URL
2. Если нужно взаимодействовать со страницей (кликнуть, ввести текст), используй `browser.scan` чтобы получить список элементов
3. Используй `browser.click`, `browser.type`, `browser.scroll` для действий
4. Используй `browser.read` для чтения текстового содержимого страницы
5. Используй `browser.screenshot` если нужно показать страницу

⚠️ **Внимание:** Инструмент `browser_search` удален. Навигация только через `browser.*`. Инструмент `browser_navigate` (с подчёркиванием) устарел, используй `browser.navigate` (с точкой).

## Примеры

**Пример 1:**
User: Открой сайт https://github.com
Assistant: [использую browser.navigate url="https://github.com"]
✅ Страница открыта!
Assistant: [использую browser.read]
Я вижу заголовок...

**Пример 2:**
User: Найди кнопку Login и нажми
Assistant: [использую browser.scan]
...получаю список элементов...
Assistant: [использую browser.click elementId=12]
Перехожу на страницу входа.

## Триггеры

- открой сайт
- зайди на
- посмотри страницу
- что на сайте
- загрузи страницу
- browse
- navigate

## Tools

- browser.navigate
- browser.scan
- browser.click
- browser.type
- browser.fill
- browser.read
- browser.screenshot
