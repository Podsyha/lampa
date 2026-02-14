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
                    self.setStatus('Ищу позицию просмотра...');

                    // Ищем позицию в Lampa.Storage
                    // Lampa сохраняет таймлайн под разными ключами
                    const position = self.findPosition(latest);
                    self.log('Позиция из Storage: ' + position + ' сек');

                    // Получаем m3u с fromlast — он вернёт правильный эпизод
                    const serverUrl = ts.url();
                    const m3uUrl = serverUrl
                        + '/stream/' + encodeURIComponent(latest.title) + '.m3u'
                        + '?link=' + latest.hash
                        + '&m3u&fromlast';

                    self.setStatus('Загружаю плейлист...');

                    const network = new Lampa.Reguest();
                    network.native(
                        m3uUrl,
                        function (playlist) {
                            if (typeof playlist !== 'string') playlist = String(playlist);

                            const lines = playlist.split('\n').map(s => s.trim()).filter(Boolean);
                            let streamUrl = null;

                            // Извлекаем название эпизода из #EXTINF для поиска позиции
                            let episodeTitle = null;
                            for (let i = 0; i < lines.length; i++) {
                                if (lines[i].startsWith('#EXTINF')) {
                                    // #EXTINF:-1,Название эпизода
                                    const match = lines[i].match(/#EXTINF[^,]*,(.*)/);
                                    if (match) episodeTitle = match[1].trim();
                                    if (i + 1 < lines.length && lines[i + 1].startsWith('http')) {
                                        streamUrl = lines[i + 1];
                                        break;
                                    }
                                }
                            }
                            if (!streamUrl) streamUrl = lines.find(l => l.startsWith('http')) || null;
                            if (!streamUrl) return self.setError('Ссылка в плейлисте не найдена');

                            self.log('Эпизод: ' + episodeTitle);
                            self.log('Stream URL: ' + streamUrl.substring(0, 80) + '...');

                            // Ищем позицию по названию эпизода если по хэшу не нашли
                            let finalPosition = position;
                            if (!finalPosition && episodeTitle) {
                                finalPosition = self.findPositionByTitle(episodeTitle);
                                self.log('Позиция по названию: ' + finalPosition + ' сек');
                            }

                            // Также проверяем все ключи Storage для отладки
                            self.logStorageKeys(latest.hash);

                            self.log('Итоговая позиция: ' + finalPosition + ' сек');
                            self.setStatus('Запускаю...');

                            Lampa.Player.play({
                                url:        streamUrl,
                                title:      episodeTitle || latest.title,
                                hash:       latest.hash,
                                timeline:   finalPosition ? { time: finalPosition * 1000, duration: 0 } : undefined,
                                start_from: finalPosition || undefined
                            });
                        },
                        function () { self.setError('Ошибка загрузки плейлиста'); },
                        false,
                        { dataType: 'text' }
                    );
                },
                function (err) {
                    self.setError('Ошибка: ' + JSON.stringify(err));
                }
            );

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        // Ищем позицию по хэшу торрента во всех известных форматах
        this.findPosition = function (torrent) {
            const hash = torrent.hash;
            const keys = [
                'timeline_' + hash,
                'time_' + hash,
                'torrent_' + hash,
                'last_' + hash,
                hash
            ];
            for (const key of keys) {
                try {
                    const val = Lampa.Storage.get(key);
                    if (val) {
                        const obj = typeof val === 'string' ? JSON.parse(val) : val;
                        const t = obj.time || obj.position || obj.current || obj;
                        if (typeof t === 'number' && t > 0) return Math.floor(t / 1000) || t;
                    }
                } catch(e) {}
            }
            return 0;
        };

        // Ищем позицию по названию эпизода
        this.findPositionByTitle = function (title) {
            try {
                const key = 'timeline_' + title;
                const val = Lampa.Storage.get(key);
                if (val) {
                    const obj = typeof val === 'string' ? JSON.parse(val) : val;
                    const t = obj.time || obj.position || obj;
                    if (typeof t === 'number' && t > 0) return Math.floor(t / 1000) || t;
                }
            } catch(e) {}
            return 0;
        };

        // Выводим в лог все Storage ключи связанные с хэшем — для диагностики
        this.logStorageKeys = function (hash) {
            try {
                // Lampa.Storage хранит всё в localStorage
                const shortHash = hash.substring(0, 8);
                const found = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && (k.includes(shortHash) || k.includes('timeline') || k.includes('time_'))) {
                        found.push(k + '=' + localStorage.getItem(k).substring(0, 60));
                    }
                }
                if (found.length) {
                    this.log('Storage keys: ' + found.join(' | '));
                } else {
                    this.log('Storage: ключи с timeline/time_ не найдены');
                }
            } catch(e) {
                this.log('Storage недоступен: ' + e.message);
            }
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
