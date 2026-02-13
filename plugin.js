(function () {
    'use strict';

    function TestComponent(object) {
        const network = new Lampa.Reguest();
        const scroll = new Lampa.Scroll({ mask: true, over: true });
        const html = $('<div></div>');

        this.create = function () {
            const status = $(`
                <div class="about" style="padding: 2rem;">
                    <h1 class="loading_title">TorrServer</h1>
                    <p class="loading_status">Подключаюсь к серверу...</p>
                    <p class="loading_debug" style="font-size:0.8em; color:#aaa; margin-top:1rem;"></p>
                </div>
            `);
            html.append(scroll.render());
            scroll.append(status);
            return this.render();
        };

        this.start = function () {
            const self = this;
            const serverUrl = (
                Lampa.Storage.get('torrserver_url') ||
                Lampa.Storage.get('torrserver_url_two') ||
                ''
            ).replace(/\/+$/, ''); // убираем trailing slash

            if (!serverUrl) return this.setError('Адрес TorrServer не настроен');

            this.setDebug('Сервер: ' + serverUrl);
            this.setStatus('Проверяю соединение...');

            // Шаг 1: проверяем доступность через /echo
            network.native(
                `${serverUrl}/echo`,
                () => {
                    self.setStatus('Получаю список торрентов...');
                    self.fetchTorrentList(serverUrl);
                },
                () => {
                    // /echo недоступен — пробуем сразу список
                    self.setDebug('Сервер: ' + serverUrl + ' (echo недоступен, пробую напрямую)');
                    self.fetchTorrentList(serverUrl);
                },
                false,
                { dataType: 'text' }
            );

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.fetchTorrentList = function (serverUrl) {
            const self = this;

            // Шаг 2: POST /torrents с action:list (стандартный способ)
            network.native(
                `${serverUrl}/torrents`,
                (result) => {
                    const list = Array.isArray(result) ? result : (result.torrents || []);
                    if (!list.length) return self.setError('Список торрентов пуст');
                    self.playLatest(serverUrl, list);
                },
                () => {
                    // POST не сработал — пробуем GET /torrents (старые версии TorrServer)
                    self.setDebug('POST /torrents не сработал, пробую GET...');
                    self.fetchTorrentListGet(serverUrl);
                },
                JSON.stringify({ action: 'list' }),
                { dataType: 'json', contentType: 'application/json' }
            );
        };

        this.fetchTorrentListGet = function (serverUrl) {
            const self = this;

            network.native(
                `${serverUrl}/torrents`,
                (result) => {
                    const list = Array.isArray(result) ? result : (result.torrents || []);
                    if (!list.length) return self.setError('Список торрентов пуст');
                    self.playLatest(serverUrl, list);
                },
                () => {
                    self.setError('Ошибка связи с TorrServer. Проверьте адрес сервера в настройках.');
                    self.setDebug('Оба метода (POST и GET) не сработали');
                },
                false,
                { dataType: 'json' }
            );
        };

        this.playLatest = function (serverUrl, list) {
            const self = this;

            list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const latest = list[0];

            this.setStatus(`Получаю плейлист: ${latest.title}`);
            this.setDebug(`hash: ${latest.hash}`);

            const m3uUrl = `${serverUrl}/stream/${encodeURIComponent(latest.title)}.m3u?link=${latest.hash}&m3u&fromlast`;

            network.native(
                m3uUrl,
                (playlist) => {
                    // Ищем ссылку после #EXTINF (корректный разбор m3u)
                    const lines = playlist.split('\n').map(s => s.trim()).filter(Boolean);
                    let streamUrl = null;

                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].startsWith('#EXTINF') && i + 1 < lines.length) {
                            const next = lines[i + 1];
                            if (next.startsWith('http')) {
                                streamUrl = next;
                                break;
                            }
                        }
                    }

                    // Фолбэк: первая http-строка
                    if (!streamUrl) {
                        streamUrl = lines.find(line => line.startsWith('http')) || null;
                    }

                    if (!streamUrl) return self.setError('Не удалось найти ссылку в плейлисте');

                    self.setDebug('stream: ' + streamUrl.substring(0, 60) + '...');

                    // Сначала запускаем плеер, потом уходим назад
                    Lampa.Player.play({
                        url: streamUrl,
                        title: latest.title,
                        hash: latest.hash
                    });
                    Lampa.Activity.backward();
                },
                () => self.setError('Ошибка при получении плейлиста'),
                false,
                { dataType: 'text' }
            );
        };

        this.setStatus = function (msg) {
            html.find('.loading_status').text(msg).css('color', '');
        };

        this.setError = function (msg) {
            html.find('.loading_title').text('Ошибка');
            html.find('.loading_status').text(msg).css('color', '#ff4e4e');
        };

        this.setDebug = function (msg) {
            html.find('.loading_debug').text(msg);
        };

        this.render = () => html;

        this.destroy = function () {
            network.clear();
            scroll.destroy();
            html.remove();
        };
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
                Lampa.Activity.push({
                    title: 'Загрузка...',
                    component: 'test_plugin',
                    page: 1
                });
            });

            $('.menu .menu__list').first().append(item);
        }

        if (window.appready) addMenuItem();
        else {
            Lampa.Listener.follow('app', (event) => {
                if (event.type === 'ready') addMenuItem();
            });
        }
    }

    if (!window.test_plugin_ready) {
        window.test_plugin_ready = true;
        startPlugin();
    }
})();
