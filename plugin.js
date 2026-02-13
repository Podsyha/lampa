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
                    <p class="loading_status">Подключаюсь...</p>
                    <div class="loading_debug" style="font-size:.75em;color:#aaa;margin-top:1.5rem;line-height:1.9"></div>
                </div>
            `));
            return this.render();
        };

        this.start = function () {
            const self = this;

            // Lampa.Torserver — встроенный модуль Lampa для работы с TorrServer
            // Он уже знает адрес сервера из настроек и умеет делать запросы в обход CORS
            const ts = Lampa.Torserver;

            this.log('Lampa.Torserver: ' + (ts ? 'есть' : 'нет'));

            if (!ts) return this.setError('Lampa.Torserver не найден');

            // Изучаем что внутри
            const tsKeys = Object.keys(ts).concat(
                Object.getOwnPropertyNames(Object.getPrototypeOf(ts) || {})
            ).filter((v, i, a) => a.indexOf(v) === i).join(', ');
            this.log('Torserver методы: ' + tsKeys);

            this.setStatus('Получаю список торрентов...');

            // Способ 1: Lampa.Torserver.torrents() — если такой метод есть
            if (typeof ts.torrents === 'function') {
                this.log('Использую ts.torrents()');
                ts.torrents(
                    function (list) {
                        self.log('ts.torrents OK, штук: ' + (list || []).length);
                        if (!list || !list.length) return self.setError('Список торрентов пуст');
                        self.playLatest(list);
                    },
                    function (err) {
                        self.log('ts.torrents ошибка: ' + JSON.stringify(err));
                        self.tryReguest();
                    }
                );
                return;
            }

            // Способ 2: Lampa.Torserver.list()
            if (typeof ts.list === 'function') {
                this.log('Использую ts.list()');
                ts.list(
                    function (list) {
                        self.log('ts.list OK, штук: ' + (list || []).length);
                        if (!list || !list.length) return self.setError('Список торрентов пуст');
                        self.playLatest(list);
                    },
                    function (err) {
                        self.log('ts.list ошибка: ' + JSON.stringify(err));
                        self.tryReguest();
                    }
                );
                return;
            }

            // Способ 3: Lampa.Torserver.get() или .send()
            if (typeof ts.send === 'function') {
                this.log('Использую ts.send({action:list})');
                ts.send(
                    { action: 'list' },
                    function (result) {
                        const list = Array.isArray(result) ? result : (result.torrents || []);
                        self.log('ts.send OK, штук: ' + list.length);
                        if (!list.length) return self.setError('Список торрентов пуст');
                        self.playLatest(list);
                    },
                    function (err) {
                        self.log('ts.send ошибка: ' + JSON.stringify(err));
                        self.tryReguest();
                    }
                );
                return;
            }

            // Если ни один из методов не подошёл — логируем и пробуем Reguest
            this.log('Известные методы Torserver не найдены, пробую Reguest...');
            this.tryReguest();

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        // Fallback через Lampa.Reguest (он есть по диагностике)
        this.tryReguest = function () {
            const self = this;
            const serverUrl = (
                Lampa.Storage.get('torrserver_url') ||
                Lampa.Storage.get('torrserver_url_two') || ''
            ).replace(/\/+$/, '');

            if (!serverUrl) return this.setError('Адрес TorrServer не настроен');

            this.log('Reguest POST ' + serverUrl + '/torrents');
            const network = new Lampa.Reguest();

            network.native(
                serverUrl + '/torrents',
                function (result) {
                    self.log('Reguest OK');
                    const list = Array.isArray(result) ? result : (result.torrents || []);
                    if (!list.length) return self.setError('Список торрентов пуст');
                    self.playLatest(list);
                },
                function (a, b, c) {
                    self.log('Reguest ошибка: ' + JSON.stringify([a, b, c]));
                    self.setError('Все методы исчерпаны.\nПришлите лог разработчику.');
                },
                JSON.stringify({ action: 'list' }),
                { dataType: 'json', contentType: 'application/json' }
            );
        };

        this.playLatest = function (list) {
            const self = this;
            const serverUrl = (
                Lampa.Storage.get('torrserver_url') ||
                Lampa.Storage.get('torrserver_url_two') || ''
            ).replace(/\/+$/, '');

            list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const latest = list[0];

            this.log('Последний: ' + latest.title);
            this.setStatus('Получаю плейлист...');

            const m3uUrl = `${serverUrl}/stream/${encodeURIComponent(latest.title)}.m3u?link=${latest.hash}&m3u&fromlast`;
            const network = new Lampa.Reguest();

            network.native(
                m3uUrl,
                function (playlist) {
                    if (typeof playlist !== 'string') playlist = JSON.stringify(playlist);
                    const lines = playlist.split('\n').map(s => s.trim()).filter(Boolean);
                    let streamUrl = null;

                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].startsWith('#EXTINF') && i + 1 < lines.length) {
                            if (lines[i + 1].startsWith('http')) {
                                streamUrl = lines[i + 1];
                                break;
                            }
                        }
                    }
                    if (!streamUrl) streamUrl = lines.find(l => l.startsWith('http')) || null;
                    if (!streamUrl) {
                        self.log('Плейлист без ссылок: ' + playlist.substring(0, 200));
                        return self.setError('Не удалось найти ссылку в плейлисте');
                    }

                    self.log('Запускаю плеер');
                    Lampa.Player.play({ url: streamUrl, title: latest.title, hash: latest.hash });
                    Lampa.Activity.backward();
                },
                function () { self.setError('Ошибка при получении плейлиста'); },
                false,
                { dataType: 'text' }
            );
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
