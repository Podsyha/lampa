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
                    <div class="loading_debug" style="font-size:.75em;color:#aaa;margin-top:1.5rem;line-height:1.9"></div>
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
                    self.setStatus('Получаю информацию о файлах...');

                    // Получаем файлы торрента — там хранится позиция последнего просмотра
                    ts.files(
                        latest.hash,
                        function (data) {
                            self.log('files() ответ: ' + JSON.stringify(data).substring(0, 400));

                            const files = data.file_stats || data.files || data || [];
                            const arr   = Array.isArray(files) ? files : Object.values(files);

                            // Ищем файл с непулевой позицией просмотра (last_stat)
                            // TorrServer хранит позицию в file_stats[n].last_stat или .viewed_time
                            const videoExts = /\.(mkv|mp4|avi|mov|ts|m2ts|wmv|flv|webm)$/i;

                            // Сортируем по last_stat — файл с последней активностью первый
                            const videoFiles = arr.filter(f => videoExts.test(f.path || f.name || ''));
                            if (!videoFiles.length && arr.length) videoFiles.push(...arr);

                            // Ищем файл с позицией > 0
                            let target = videoFiles.find(f => {
                                const pos = (f.last_stat && f.last_stat.file_viewed)
                                    || f.viewed_time
                                    || f.position
                                    || 0;
                                return pos > 0;
                            });
                            // Если не нашли с позицией — берём первый видеофайл
                            if (!target) target = videoFiles[0] || arr[0];

                            self.log('Файл: ' + JSON.stringify(target).substring(0, 200));

                            if (!target) return self.setError('Нет файлов в торренте');

                            // Извлекаем позицию из всех возможных полей
                            const position = (target.last_stat && (
                                    target.last_stat.file_viewed ||
                                    target.last_stat.viewed ||
                                    target.last_stat.position
                                ))
                                || target.viewed_time
                                || target.position
                                || 0;

                            self.log('Позиция: ' + position + ' сек');

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

                                    for (let i = 0; i < lines.length; i++) {
                                        if (lines[i].startsWith('#EXTINF') && i + 1 < lines.length) {
                                            if (lines[i + 1].startsWith('http')) {
                                                streamUrl = lines[i + 1];
                                                break;
                                            }
                                        }
                                    }
                                    if (!streamUrl) streamUrl = lines.find(l => l.startsWith('http')) || null;
                                    if (!streamUrl) return self.setError('Ссылка в плейлисте не найдена');

                                    self.log('Stream URL: ' + streamUrl.substring(0, 80) + '...');
                                    self.log('Старт с позиции: ' + position + ' сек');
                                    self.setStatus('Запускаю...');

                                    Lampa.Player.play({
                                        url:      streamUrl,
                                        title:    latest.title,
                                        hash:     latest.hash,
                                        // Позиция в миллисекундах — стандарт Lampa Player
                                        timeline: position ? { time: position * 1000, duration: 0 } : undefined,
                                        // Некоторые сборки Lampa используют start_from в секундах
                                        start_from: position || undefined
                                    });
                                },
                                function () { self.setError('Ошибка загрузки плейлиста'); },
                                false,
                                { dataType: 'text' }
                            );
                        },
                        function (err) {
                            self.log('files() ошибка: ' + JSON.stringify(err));
                            // Фолбэк — запускаем без позиции
                            self.launchWithoutPosition(latest);
                        }
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

        this.launchWithoutPosition = function (latest) {
            const self = this;
            const ts   = Lampa.Torserver;
            const serverUrl = ts.url();
            const m3uUrl = serverUrl
                + '/stream/' + encodeURIComponent(latest.title) + '.m3u'
                + '?link=' + latest.hash + '&m3u&fromlast';

            const network = new Lampa.Reguest();
            network.native(
                m3uUrl,
                function (playlist) {
                    if (typeof playlist !== 'string') playlist = String(playlist);
                    const lines = playlist.split('\n').map(s => s.trim()).filter(Boolean);
                    let streamUrl = lines.find(l => l.startsWith('http')) || null;
                    if (!streamUrl) return self.setError('Ссылка не найдена');
                    Lampa.Player.play({ url: streamUrl, title: latest.title, hash: latest.hash });
                },
                function () { self.setError('Ошибка загрузки плейлиста'); },
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
