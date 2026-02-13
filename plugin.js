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
                    <p class="loading_status">Подключаюсь...</p>
                    <div class="loading_debug" style="font-size:0.75em; color:#aaa; margin-top:1.5rem; line-height:1.6;"></div>
                </div>
            `);
            html.append(scroll.render());
            scroll.append(status);
            return this.render();
        };

        this.start = function () {
            const self = this;

            // Собираем все возможные адреса из настроек
            const urlOne = (Lampa.Storage.get('torrserver_url') || '').replace(/\/+$/, '');
            const urlTwo = (Lampa.Storage.get('torrserver_url_two') || '').replace(/\/+$/, '');

            this.log('torrserver_url: [' + (urlOne || 'пусто') + ']');
            this.log('torrserver_url_two: [' + (urlTwo || 'пусто') + ']');

            const candidates = [urlOne, urlTwo].filter(Boolean);

            if (!candidates.length) {
                return this.setError('Адрес TorrServer не настроен ни в одном из полей');
            }

            this.setStatus('Проверяю серверы...');
            this.tryNextServer(candidates, 0);

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        // Перебираем серверы по очереди
        this.tryNextServer = function (candidates, index) {
            if (index >= candidates.length) {
                this.setError('Ни один из серверов не ответил');
                return;
            }
            const self = this;
            const url = candidates[index];
            this.log('--- Пробую сервер: ' + url);
            this.setStatus('Пробую: ' + url);
            this.tryEcho(url,
                () => self.fetchTorrents(url),
                () => self.tryNextServer(candidates, index + 1)
            );
        };

        // Проверка доступности сервера через /echo
        this.tryEcho = function (serverUrl, onSuccess, onFail) {
            const self = this;
            this.log('GET ' + serverUrl + '/echo');
            network.native(
                `${serverUrl}/echo`,
                (data) => {
                    self.log('/echo ОК: ' + String(data).substring(0, 40));
                    onSuccess();
                },
                (err) => {
                    self.log('/echo ОШИБКА — сервер недоступен');
                    onFail();
                },
                false,
                { dataType: 'text' }
            );
        };

        // Получаем список торрентов: сначала POST, потом GET
        this.fetchTorrents = function (serverUrl) {
            const self = this;
            this.log('POST ' + serverUrl + '/torrents {"action":"list"}');
            this.setStatus('Запрашиваю список торрентов...');

            network.native(
                `${serverUrl}/torrents`,
                (result) => {
                    self.log('POST /torrents ОК');
                    const list = Array.isArray(result) ? result : (result.torrents || []);
                    if (!list.length) return self.setError('Список торрентов пуст');
                    self.playLatest(serverUrl, list);
                },
                () => {
                    self.log('POST /torrents ОШИБКА — пробую GET');
                    network.native(
                        `${serverUrl}/torrents`,
                        (result) => {
                            self.log('GET /torrents ОК');
                            const list = Array.isArray(result) ? result : (result.torrents || []);
                            if (!list.length) return self.setError('Список торрентов пуст');
                            self.playLatest(serverUrl, list);
                        },
                        () => {
                            self.log('GET /torrents ОШИБКА');
                            // Последняя попытка — /api/v1/torrents (MatriX/новые сборки)
                            self.log('GET ' + serverUrl + '/api/v1/torrents');
                            network.native(
                                `${serverUrl}/api/v1/torrents`,
                                (result) => {
                                    self.log('/api/v1/torrents ОК');
                                    const list = Array.isArray(result) ? result : (result.torrents || []);
                                    if (!list.length) return self.setError('Список торрентов пуст');
                                    self.playLatest(serverUrl, list);
                                },
                                () => {
                                    self.log('/api/v1/torrents ОШИБКА');
                                    self.setError('Сервер доступен, но не отдаёт торренты.\nПокажите лог разработчику.');
                                },
                                false,
                                { dataType: 'json' }
                            );
                        },
                        false,
                        { dataType: 'json' }
                    );
                },
                JSON.stringify({ action: 'list' }),
                { dataType: 'json', contentType: 'application/json' }
            );
        };

        this.playLatest = function (serverUrl, list) {
            const self = this;
            list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const latest = list[0];

            this.log('Найдено торрентов: ' + list.length);
            this.log('Последний: ' + latest.title);
            this.setStatus('Получаю плейлист...');

            const m3uUrl = `${serverUrl}/stream/${encodeURIComponent(latest.title)}.m3u?link=${latest.hash}&m3u&fromlast`;
            this.log('Плейлист: ' + m3uUrl.substring(0, 80) + '...');

            network.native(
                m3uUrl,
                (playlist) => {
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
                    if (!streamUrl) {
                        streamUrl = lines.find(line => line.startsWith('http')) || null;
                    }

                    if (!streamUrl) {
                        self.log('Плейлист пришёл, но ссылок нет:');
                        self.log(playlist.substring(0, 200));
                        return self.setError('Не удалось найти ссылку в плейлисте');
                    }

                    self.log('stream URL найден, запускаю плеер');
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

        this.log = function (msg) {
            const el = html.find('.loading_debug');
            el.html(el.html() + msg + '<br>');
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
