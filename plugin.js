(function () {
    'use strict';

    function TestComponent(object) {
        const scroll = new Lampa.Scroll({ mask: true, over: true });
        const html = $('<div></div>');

        this.create = function () {
            const status = $(`
                <div class="about" style="padding: 2rem;">
                    <h1 class="loading_title">TorrServer</h1>
                    <p class="loading_status">Подключаюсь...</p>
                    <div class="loading_debug" style="font-size:0.75em; color:#aaa; margin-top:1.5rem; line-height:1.8;"></div>
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
            ).replace(/\/+$/, '');

            if (!serverUrl) return this.setError('Адрес TorrServer не настроен');

            this.log('URL: ' + serverUrl);
            this.setStatus('Запрашиваю торренты...');

            // Используем $.ajax напрямую — лучше работает на Android TV
            $.ajax({
                url: serverUrl + '/torrents',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ action: 'list' }),
                timeout: 10000,
                success: function (result) {
                    self.log('$.ajax POST /torrents — OK');
                    const list = Array.isArray(result) ? result : (result.torrents || []);
                    if (!list.length) return self.setError('Список торрентов пуст');
                    self.playLatest(serverUrl, list);
                },
                error: function (xhr, status, err) {
                    self.log('$.ajax POST ошибка: ' + status + ' / ' + err);
                    self.log('HTTP статус: ' + xhr.status);
                    self.log('Ответ: ' + String(xhr.responseText).substring(0, 100));

                    // Пробуем через Lampa.Api если есть
                    if (Lampa.Api && Lampa.Api.sources) {
                        self.log('Пробую Lampa.Api...');
                    }

                    // Пробуем GET без тела
                    self.log('Пробую GET /torrents...');
                    $.ajax({
                        url: serverUrl + '/torrents',
                        method: 'GET',
                        timeout: 10000,
                        success: function (result) {
                            self.log('GET /torrents — OK');
                            const list = Array.isArray(result) ? result : (result.torrents || []);
                            if (!list.length) return self.setError('Список торрентов пуст');
                            self.playLatest(serverUrl, list);
                        },
                        error: function (xhr2, status2, err2) {
                            self.log('GET ошибка: ' + status2 + ' HTTP:' + xhr2.status);
                            self.log('Ответ: ' + String(xhr2.responseText).substring(0, 100));
                            self.tryEcho(serverUrl);
                        }
                    });
                }
            });

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        // Если оба метода не работают — проверяем хотя бы /echo
        // чтобы понять: сеть или API
        this.tryEcho = function (serverUrl) {
            const self = this;
            this.log('Проверяю /echo...');
            $.ajax({
                url: serverUrl + '/echo',
                method: 'GET',
                timeout: 8000,
                success: function (data) {
                    self.log('/echo ОК: ' + String(data).substring(0, 60));
                    self.setError('Сервер отвечает, но /torrents не работает.\nПришлите лог разработчику.');
                },
                error: function (xhr, status) {
                    self.log('/echo ОШИБКА: ' + status + ' HTTP:' + xhr.status);
                    if (xhr.status === 0) {
                        self.setError('Нет доступа к серверу с этого устройства.\n(CORS или сеть)');
                        self.log('Возможная причина: CORS-блокировка на TV');
                    } else {
                        self.setError('Сервер недоступен (HTTP ' + xhr.status + ')');
                    }
                }
            });
        };

        this.playLatest = function (serverUrl, list) {
            const self = this;
            list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const latest = list[0];

            this.log('Торрентов: ' + list.length + ', последний: ' + latest.title);
            this.setStatus('Получаю плейлист...');

            const m3uUrl = `${serverUrl}/stream/${encodeURIComponent(latest.title)}.m3u?link=${latest.hash}&m3u&fromlast`;

            $.ajax({
                url: m3uUrl,
                method: 'GET',
                timeout: 10000,
                success: function (playlist) {
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
                        self.log('Плейлист пришёл без ссылок:\n' + playlist.substring(0, 200));
                        return self.setError('Не удалось найти ссылку в плейлисте');
                    }

                    self.log('Запускаю: ' + streamUrl.substring(0, 60) + '...');
                    Lampa.Player.play({
                        url: streamUrl,
                        title: latest.title,
                        hash: latest.hash
                    });
                    Lampa.Activity.backward();
                },
                error: function (xhr, status) {
                    self.log('Ошибка плейлиста: ' + status + ' HTTP:' + xhr.status);
                    self.setError('Ошибка при получении плейлиста');
                }
            });
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
