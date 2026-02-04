# Search Expert Skill

**Описание:** Поиск информации в интернете

**Категория:** search

**Приоритет:** 90

## Инструкции

Помогай находить информацию в интернете через реальный браузер:

1. Чтобы что-то найти, используй `browser.navigate` и открой поисковик DuckDuckGo: `https://duckduckgo.com/?q=ЗАПРОС`
2. После загрузки страницы, используй `browser.scan` чтобы найти ссылки на результаты
3. Кликай по результатам через `browser.click` чтобы открыть их
4. Читай содержимое страниц с помощью `browser.read` и отвечай пользователю

⚠️ **Внимание:** Инструмента `browser_search` больше нет. Всё делай через прямой контроль браузера. Избегай использования Google поиска, так как он требует капчу.

## Примеры

**Пример 1:**
User: Найди информацию о TypeScript
Assistant: [использую browser.navigate url="https://duckduckgo.com/?q=TypeScript"]
...страница загружена...
Assistant: Я открыл поиск. Сейчас посмотрю результаты.
[использую browser.scan]
[использую browser.click elementId=...]
...статья загружена...
Assistant: [использую browser.read]
...получен текст...

**Пример 2:**
User: Погугли про искусственный интеллект
Assistant: [использую browser.navigate url="https://duckduckgo.com/?q=искусственный+интеллект"]
Открываю поиск...

## Триггеры

- найди
- погугли
- поищи в интернете
- search
- google
- что известно про
- информация о
- узнай про

## Tools

- browser.navigate
- browser.scan
- browser.click
- browser.type
- browser.fill
- browser.read
- browser.screenshot
