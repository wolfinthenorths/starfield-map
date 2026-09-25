# Источники спрайтов

Графика Fallout / Fallout Tactics из набора, предоставленного пользователем:
https://drive.google.com/drive/folders/1lHiN5RV-PoGY-xiBOwT84KhPHkp43fii

| Новые элементы | Исходный лист |
| --- | --- |
| Модули стойки, касса | bar-table.png |
| Кресло за стойкой | chairs.png |
| Круглый столик | bar-furniture.png |
| Машины и трубы у шлюзов | wall-decor.png |
| Настенный светильник | Scenery-002_PID.gif |
| Вентиляционная решётка | Scenery-001_PID.gif |
| Робот-контроллер | Critters_PID.gif |

Существующие диваны, кресла, напольные светильники, терминалы, стены и плитка — из того же пользовательского набора. Вырезки сохраняют исходные пиксели; фон листов удалён, масштабирование выполняется без сглаживания. Ступени и стены собираются из этих текстур, указатели рисуются кодом. Персонаж — исходная анимация классического Fallout; источник и обработка указаны ниже. Сгенерированных изображений на карте нет.

Исходная GIF JoinMyParty1.gif предоставлена пользователем и используется без перерисовки. Права на оригинальную игровую графику принадлежат её правообладателям; этот файл не утверждает наличие отдельной лицензии на распространение.

## Интерьерные элементы фойе

Новые вырезки `vaultLamp`, `vaultVent`, `steelBench`, `luggageCabinet` — из предоставленного листа **Fallout Tactics / Vault Objects**; `utilityCabinet`, `waterDispenser`, `supplyCase` — из **Fallout Tactics / Base Furniture**. Коричневые механизмы и уличные фонари больше не используются на уровне 0. Исходные пиксели сохранены, фон удалён программно. Графика других источников в это обновление не добавлялась.

## Группировка зон и настенные приборы

Зелень в одинаковых кашпо — вырезка растения PID 942 из **Scenery-004_PID.gif** пользовательского набора; кашпо собирается из общей текстуры стены. Настенные лампы и решётки из **Vault Objects** преобразуются из исходной изометрической проекции в плоскость стены и затем следуют её углу. Сглаживание при масштабировании отключено.

## Ракурсы и хранение

Четыре направления компактного терминала (`kioskX`, `kioskY`, `kioskNegX`, `kioskNegY`) вырезаны из **Fallout Tactics / Base Furniture**. Стул за стойкой (`receptionSeatY`) взят из соответствующего ракурса **Chairs**. Металлические ячейки багажа — PID 423 из **Scenery-002_PID.gif**. Встроенная прямоугольная вентиляция собирается из общих текстур стены и решётки **Vault Wall / Vault Floor** и рисуется вместе с несущей стеновой панелью. Все исходники — из пользовательского набора.


## Персонаж и разнообразие панелей — 24 сентября

- Атлас жителя в синем комбинезоне: **VaultDwellers_Melee.png**, `Assets/textures/characters/VaultDwellers/` внутри [Assets.zip проекта Fallout Strategy](https://github.com/Kalima-Entertainment/Fallout_Strategy/blob/5985589c75fa4559e061b9e848f906ee7ebafd7b/FalloutStrategy/FalloutStrategy/Assets.zip), команда Kalima Entertainment. Проект атрибутирует исходные игровые спрайты Fallout правообладателям игры. Используются только четыре исходных ракурса, ходьба (колонки 19–26) и нейтральная стойка (колонка 10), с исходной опорной точкой, без ИИ и перерисовки тела. Чёрная тень сделана полупрозрачной.
- Второе растение: PID 943, **Scenery-004_PID.gif**. Контейнер с формой: **Base Furniture.png**. Эти листы уже были предоставлены пользователем.
- Плакат приветствия использует кадр предоставленной **JoinMyParty1.gif**; металлические рамки панелей и ламп используют текстуру **Vault Wall**. Надписи и индикаторы добавлены кодом как элементы интерфейса окружения. Это прозрачные плоские материалы, проецируемые непосредственно на общие стеновые панели.
- Световое пятно — эффект Canvas на стене и полу. Нейросетевые изображения не используются.

## Звук и предметы — 25 сентября

- Музыка: **Lobby Time**, Kevin MacLeod (incompetech.com), [страница композиции](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600054), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Полный трек перекодирован в моно MP3 64 kbit/s. Громкость задаётся в приложении.
- Короткие эффекты: [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) (click_001, confirmation_001, error_003) и [Kenney Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) (doorOpen_000/001, doorClose_000/001), CC0. Перекодированы в MP3 для мобильных браузеров. Шипение дезактивации — фильтрованный шум Web Audio.
- `items/battery.png`, `filter.png`, `medical.png`, `lamp.png`: пользовательская коллекция Google Drive, файлы «Предвоенные аккумуляторные блоки.png», «Ручные фильтры.png», «Аптечка первой помощи.webp», «Химические лампы.png».
- `items/locker.png`: предоставленный ранее спрайт багажа Fallout, Scenery-002_PID.gif.
- `items/uniform.png`: Fallout 4, [Fo4 folded jumpsuit back.jpg](https://fallout.fandom.com/wiki/File:Fo4_folded_jumpsuit_back.jpg).
- `items/bag.png`: Fallout 4 duffle bag, [источник](https://www.nicepng.com/maxp/u2q8e6r5u2q8u2e6/).
- `items/mask.png`: Fallout gas mask with goggles, [источник](https://www.pngkit.com/bigpic/u2e6y3i1t4t4t4y3/).
- `items/tape.png`: Fallout New Vegas duct tape, [источник](https://www.nicepng.com/maxp/u2q8y3e6o0a9o0u2/).
- `items/cup.png`: Fallout 4 Far Harbor coffee cup, [источник](https://www.clipartmax.com/middle/m2i8b1Z5K9A0i8b1_fo4fh-coffee-cup-fallout-4-coffee/).
- Игровые изображения принадлежат правообладателям Fallout. Указание источника не означает отдельную лицензию. Миниатюры обрезаны по содержимому, светлый фон удалён там, где он был однотонным; пропорции сохранены в общей ячейке 96×96. Содержимое сгруппировано в показанные наборы.

Дополнение: `audio/robot.mp3` — Kenney Sci-fi Sounds, computerNoise_001 (CC0), фрагмент 1,2 секунды с плавными краями и смягчением высоких частот. У миниатюр удалены оставшиеся белые и клетчатые подложки внутри замкнутых областей.
