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
                    <p class="loading_status">Ищу последний запущенный файл...</p>
                </div>
            `);

            html.append(scroll.render());
            scroll.append(status);
            return this.render();
        };

        this.start = function () {
            const serverUrl = Lampa.Storage.get('torrserver_url') || Lampa.Storage.get('torrserver_url_two');

            if (!serverUrl) return this.setError('Адрес TorrServer не настроен');

            network.native(
                `${serverUrl}/torrents`,
                (result) => {
                    const list = Array.isArray(result) ? result : (result.torrents || []);
                    if (!list.length) return this.setError('Список торрентов пуст');

                    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    const latest = list[0];

                    html.find('.loading_status').text(`Запускаю: ${latest.title}`);

                    const m3uUrl = `${serverUrl}/stream/${encodeURIComponent(latest.title)}.m3u?link=${latest.hash}&m3u&fromlast`;

                    network.native(
                        m3uUrl,
                        (playlist) => {
                            const streamUrl = playlist
                                .split('\n')
                                .map(str => str.trim())
                                .find(line => line.startsWith('http'));

                            if (!streamUrl) return this.setError('Не удалось найти ссылку в плейлисте');

                            Lampa.Activity.backward();
                            Lampa.Player.play({
                                url: streamUrl,
                                title: latest.title,
                                hash: latest.hash
                            });
                        },
                        () => this.setError('Ошибка при получении плейлиста'),
                        false,
                        { dataType: 'text' }
                    );
                },
                () => this.setError('Ошибка связи с TorrServer'),
                JSON.stringify({ action: 'list' }),
                { dataType: 'json', contentType: 'application/json' }
            );

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.setError = function (msg) {
            html.find('.loading_title').text('Ошибка');
            html.find('.loading_status').text(msg).css('color', '#ff4e4e');
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
