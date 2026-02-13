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

            // Lampa.Torserver.my() — встроенный метод для получения списка торрентов
            // Использует правильный URL и метод запроса из самой Lampa
            ts.my(
                function (list) {
                    if (!list || !list.length) return self.setError('Список торрентов пуст');

                    // Сортируем по времени добавления — самый свежий первый
                    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    const latest = list[0];

                    self.setStatus('Запускаю: ' + latest.title);

                    // Lampa.Torserver.stream(path, hash, id) — строит правильный URL стрима
                    // files() сначала получает список файлов в торренте
                    ts.files(
                        latest.hash,
                        function (data) {
                            // data.file_stats — массив файлов торрента
                            const files = data.file_stats || [];

                            // Ищем последний просмотренный файл или просто первый видеофайл
                            const videoExts = /\.(mkv|mp4|avi|mov|ts|m2ts|wmv|flv|webm)$/i;
                            let target = files.find(f => videoExts.test(f.path));
                            if (!target && files.length) target = files[0];

                            if (!target) return self.setError('Нет файлов в торренте');

                            // stream(path, hash, id) — родной метод Torserver
                            const streamUrl = ts.stream(target.path, latest.hash, target.id);
                            self.log('URL: ' + streamUrl);

                            Lampa.Player.play({
                                url:   streamUrl,
                                title: latest.title,
                                hash:  latest.hash
                            });
                            Lampa.Activity.backward();
                        },
                        function (err) {
                            self.log('files() ошибка, пробую stream напрямую');
                            // Если files() не сработал — пробуем stream с путём из title
                            const streamUrl = ts.stream(latest.title, latest.hash, 1);
                            self.log('URL: ' + streamUrl);

                            Lampa.Player.play({
                                url:   streamUrl,
                                title: latest.title,
                                hash:  latest.hash
                            });
                            Lampa.Activity.backward();
                        }
                    );
                },
                function (err) {
                    self.log('my() ошибка: ' + JSON.stringify(err));
                    self.setError('Не удалось получить список торрентов');
                }
            );

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
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
