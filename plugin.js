(function () {
    'use strict';

    function TestComponent(object) {
        const scroll = new Lampa.Scroll({ mask: true, over: true });
        const html   = $('<div></div>');

        this.create = function () {
            html.append(scroll.render());
            scroll.append($(`
                <div class="about" style="padding:2rem">
                    <h1 class="loading_title">TorrServer</h1>
                    <p class="loading_status">Ищу последний файл...</p>
                    <div class="loading_debug" style="font-size:.75em;color:#aaa;margin-top:1.5rem;line-height:1.9;word-break:break-all"></div>
                </div>
            `));
            return this.render();
        };

        this.start = function () {
            const self = this;
            const ts   = Lampa.Torserver;

            ts.my(
                function (list) {
                    if (!list || !list.length) return self.setError('Список торрентов пуст');

                    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    const latest = list[0];
                    self.log('Торрент: ' + latest.title);
                    self.setStatus('Загружаю плейлист...');

                    const serverUrl = ts.url();

                    // Запрашиваем ПОЛНЫЙ m3u без fromlast — он содержит все серии
                    // fromlast используем только чтобы узнать с какой серии начать
                    const fullM3u    = serverUrl + '/stream/' + encodeURIComponent(latest.title) + '.m3u?link=' + latest.hash + '&m3u';
                    const lastM3u    = serverUrl + '/stream/' + encodeURIComponent(latest.title) + '.m3u?link=' + latest.hash + '&m3u&fromlast';

                    const network = new Lampa.Reguest();

                    // Сначала получаем полный список серий
                    network.native(
                        fullM3u,
                        function (fullPlaylist) {
                            if (typeof fullPlaylist !== 'string') fullPlaylist = String(fullPlaylist);

                            const allItems = self.parseM3U(fullPlaylist);
                            self.log('Всего серий: ' + allItems.length);

                            if (!allItems.length) return self.setError('Плейлист пуст');

                            // Получаем fromlast чтобы узнать какая серия последняя
                            const network2 = new Lampa.Reguest();
                            network2.native(
                                lastM3u,
                                function (lastPlaylist) {
                                    if (typeof lastPlaylist !== 'string') lastPlaylist = String(lastPlaylist);

                                    const lastItems = self.parseM3U(lastPlaylist);
                                    const lastUrl   = lastItems.length ? lastItems[0].url : null;

                                    self.log('Последняя серия URL: ' + (lastUrl ? lastUrl.substring(0, 60) + '...' : 'не найдена'));

                                    // Находим индекс последней серии в полном списке
                                    let startIndex = 0;
                                    if (lastUrl) {
                                        const idx = allItems.findIndex(item => item.url === lastUrl);
                                        if (idx !== -1) startIndex = idx;
                                    }

                                    self.log('Старт с серии #' + (startIndex + 1) + ': ' + (allItems[startIndex] ? allItems[startIndex].title : '?'));

                                    // Позиция внутри серии из Storage
                                    const position = self.findPosition(latest.hash, allItems[startIndex]);
                                    self.log('Позиция: ' + position + ' сек');

                                    self.setStatus('Запускаю...');
                                    self.launchPlayer(allItems, startIndex, latest, position);
                                },
                                function () {
                                    // fromlast не сработал — стартуем с первой серии
                                    self.log('fromlast не сработал, старт с начала');
                                    self.launchPlayer(allItems, 0, latest, 0);
                                },
                                false,
                                { dataType: 'text' }
                            );
                        },
                        function () { self.setError('Ошибка загрузки плейлиста'); },
                        false,
                        { dataType: 'text' }
                    );
                },
                function (err) { self.setError('Ошибка: ' + JSON.stringify(err)); }
            );

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        // Парсим m3u — возвращаем массив {title, url}
        this.parseM3U = function (text) {
            const lines  = text.split('\n').map(s => s.trim()).filter(Boolean);
            const result = [];
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF')) {
                    const match = lines[i].match(/#EXTINF[^,]*,(.*)/);
                    const title = match ? match[1].trim() : '';
                    if (i + 1 < lines.length && lines[i + 1].startsWith('http')) {
                        result.push({ title: title, url: lines[i + 1] });
                        i++;
                    }
                }
            }
            // Фолбэк — просто все http строки
            if (!result.length) {
                lines.filter(l => l.startsWith('http')).forEach(url => result.push({ title: '', url }));
            }
            return result;
        };

        // Запускаем плеер с полным плейлистом
        this.launchPlayer = function (items, startIndex, torrent, position) {
            const startItem = items[startIndex];
            if (!startItem) return this.setError('Не удалось определить серию');

            // Формируем playlist в формате который понимает Lampa Player
            // Lampa.Player принимает поле playlist как массив {url, title}
            const playerData = {
                url:        startItem.url,
                title:      torrent.title,
                hash:       torrent.hash,
                playlist:   items.map(function (item, idx) {
                    return {
                        url:     item.url,
                        title:   item.title || (torrent.title + ' — ' + (idx + 1)),
                        active:  idx === startIndex
                    };
                }),
                index:      startIndex,
                timeline:   position ? { time: position * 1000, duration: 0 } : undefined,
                start_from: position || undefined
            };

            this.log('Передаю в плеер ' + items.length + ' серий, старт с #' + (startIndex + 1));
            Lampa.Player.play(playerData);
        };

        // Ищем сохранённую позицию в Lampa Storage / localStorage
        this.findPosition = function (hash, item) {
            // Пробуем по хэшу торрента
            const keys = ['timeline_' + hash, 'time_' + hash, hash];
            if (item && item.title) keys.unshift('timeline_' + item.title);

            for (const key of keys) {
                try {
                    const val = Lampa.Storage.get(key);
                    if (val) {
                        const obj = typeof val === 'string' ? JSON.parse(val) : val;
                        const t   = obj.time || obj.position || obj.current || 0;
                        if (typeof t === 'number' && t > 10) {
                            // Lampa хранит время в мс если > 1000, иначе в сек
                            return t > 1000 ? Math.floor(t / 1000) : t;
                        }
                    }
                } catch(e) {}
            }

            // Ищем в localStorage напрямую
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.includes(hash.substring(0, 8))) {
                        this.log('localStorage key: ' + k + ' = ' + localStorage.getItem(k).substring(0, 80));
                    }
                }
            } catch(e) {}

            return 0;
        };

        this.setStatus = function (msg) { html.find('.loading_status').text(msg).css('color', ''); };
        this.setError  = function (msg) {
            html.find('.loading_title').text('Ошибка');
            html.find('.loading_status').text(msg).css('color', '#ff4e4e');
        };
        this.log = function (msg) {
            const el = html.find('.loading_debug');
            el.html(el.html() + msg + '<br>');
        };
        this.render  = () => html;
        this.destroy = function () { scroll.destroy(); html.remove(); };
    }

    function startPlugin() {
        Lampa.Component.add('test_plugin', TestComponent);

        function addMenuItem() {
            if ($('.menu__item[data-type="test_plugin_button"]').length) return;
            const item = $(`
                <li class="menu__item selector" data-type="test_plugin_button">
                    <div class="menu__ico">
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
                        </svg>
                    </div>
                    <div class="menu__text">Продолжить просмотр</div>
                </li>
            `);
            item.on('hover:enter', () => {
                Lampa.Activity.push({ title: 'Загрузка...', component: 'test_plugin', page: 1 });
            });
            $('.menu .menu__list').first().append(item);
        }

        if (window.appready) addMenuItem();
        else Lampa.Listener.follow('app', e => { if (e.type === 'ready') addMenuItem(); });
    }

    if (!window.test_plugin_ready) {
        window.test_plugin_ready = true;
        startPlugin();
    }
})();
