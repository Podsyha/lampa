(function () {
    'use strict';

    // Универсальная функция запроса:
    // 1. Если есть Android-оболочка Lampa — используем нативный fetch (обходит CORS)
    // 2. Иначе — $.ajax (для браузера/других платформ)
    function nativeFetch(opts) {
        // opts: { url, method, body, headers, success, error }
        const method  = opts.method  || 'GET';
        const body    = opts.body    || null;
        const headers = opts.headers || {};

        // Способ 1: Lampa.Nativerequest (есть в Android-сборках Lampa)
        if (window.Lampa && Lampa.Nativerequest) {
            Lampa.Nativerequest.request(
                { url: opts.url, method: method, headers: headers, body: body || '' },
                function (response) {
                    try {
                        const data = typeof response === 'string' ? JSON.parse(response) : response;
                        opts.success(data);
                    } catch (e) {
                        opts.success(response); // вернём как есть (для text-ответов)
                    }
                },
                function (err) { opts.error('Nativerequest: ' + err); }
            );
            return;
        }

        // Способ 2: Android-интерфейс напрямую (старые сборки)
        if (window.Android && Android.request) {
            try {
                const result = Android.request(opts.url, method, body || '', JSON.stringify(headers));
                const data = typeof result === 'string' ? JSON.parse(result) : result;
                opts.success(data);
            } catch (e) {
                opts.error('Android.request: ' + e.message);
            }
            return;
        }

        // Способ 3: $.ajax (браузер, fallback)
        $.ajax({
            url:         opts.url,
            method:      method,
            contentType: headers['Content-Type'] || 'application/json',
            data:        body,
            timeout:     12000,
            success:     opts.success,
            error: function (xhr, status, err) {
                opts.error('$.ajax [' + xhr.status + '] ' + status + ' ' + err);
            }
        });
    }

    function TestComponent(object) {
        const scroll = new Lampa.Scroll({ mask: true, over: true });
        const html   = $('<div></div>');

        this.create = function () {
            html.append(scroll.render());
            scroll.append($(`
                <div class="about" style="padding:2rem">
                    <h1 class="loading_title">TorrServer</h1>
                    <p class="loading_status">Подключаюсь...</p>
                    <div class="loading_debug" style="font-size:.75em;color:#aaa;margin-top:1.5rem;line-height:1.8"></div>
                </div>
            `));
            return this.render();
        };

        this.start = function () {
            const self = this;
            const serverUrl = (
                Lampa.Storage.get('torrserver_url') ||
                Lampa.Storage.get('torrserver_url_two') || ''
            ).replace(/\/+$/, '');

            if (!serverUrl) return this.setError('Адрес TorrServer не настроен');

            // Показываем какой метод запроса будет использован
            const method = window.Lampa && Lampa.Nativerequest ? 'Nativerequest'
                         : window.Android && Android.request    ? 'Android.request'
                         : '$.ajax (CORS может блокировать)';
            this.log('Метод: ' + method);
            this.log('URL: ' + serverUrl);
            this.setStatus('Запрашиваю список торрентов...');

            nativeFetch({
                url:     serverUrl + '/torrents',
                method:  'POST',
                body:    JSON.stringify({ action: 'list' }),
                headers: { 'Content-Type': 'application/json' },
                success: function (result) {
                    self.log('POST /torrents — OK');
                    const list = Array.isArray(result) ? result : (result.torrents || []);
                    if (!list.length) return self.setError('Список торрентов пуст');
                    self.playLatest(serverUrl, list);
                },
                error: function (err) {
                    self.log('POST /torrents — ' + err);
                    // Пробуем GET
                    nativeFetch({
                        url:    serverUrl + '/torrents',
                        method: 'GET',
                        success: function (result) {
                            self.log('GET /torrents — OK');
                            const list = Array.isArray(result) ? result : (result.torrents || []);
                            if (!list.length) return self.setError('Список торрентов пуст');
                            self.playLatest(serverUrl, list);
                        },
                        error: function (err2) {
                            self.log('GET /torrents — ' + err2);
                            self.setError('Нет доступа к TorrServer.\nМетод: ' + method);
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

        this.playLatest = function (serverUrl, list) {
            const self = this;
            list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const latest = list[0];

            this.log('Последний: ' + latest.title);
            this.setStatus('Получаю плейлист...');

            const m3uUrl = `${serverUrl}/stream/${encodeURIComponent(latest.title)}.m3u?link=${latest.hash}&m3u&fromlast`;

            nativeFetch({
                url:    m3uUrl,
                method: 'GET',
                success: function (playlist) {
                    // nativeFetch мог распарсить как JSON — обратно в строку
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
                        self.log('Плейлист:\n' + playlist.substring(0, 300));
                        return self.setError('Не удалось найти ссылку в плейлисте');
                    }

                    self.log('Запускаю плеер...');
                    Lampa.Player.play({ url: streamUrl, title: latest.title, hash: latest.hash });
                    Lampa.Activity.backward();
                },
                error: function (err) {
                    self.log('Плейлист — ' + err);
                    self.setError('Ошибка при получении плейлиста');
                }
            });
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
