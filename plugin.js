(function () {
    'use strict';

    function hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    function TestComponent(object) {
        const scroll = new Lampa.Scroll({ mask: true, over: true });
        const html   = $('<div></div>');

        this.create = function () {
            html.append(scroll.render());
            scroll.append($(`
                <div class="about" style="padding:2rem">
                    <h1 class="loading_title" style="font-size:1.2em">Поиск хэша URL</h1>
                    <div class="loading_debug" style="font-size:.78em;color:#ddd;margin-top:1rem;line-height:1.9"></div>
                </div>
            `));
            return this.render();
        };

        this.start = function () {
            const self = this;
            const ts   = Lampa.Torserver;

            // Известные хэши из file_view с ТВ
            const knownHashes = [
                '49463088','66208688','68319923','79119831',
                '109972911','166718282','198177767','208617741'
            ];

            ts.my(function (list) {
                if (!list || !list.length) return self.log('Нет торрентов');

                list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                const latest    = list[0];
                const serverUrl = ts.url();
                const fullM3u   = serverUrl + '/stream/' + encodeURIComponent(latest.title) + '.m3u?link=' + latest.hash + '&m3u';

                const network = new Lampa.Reguest();
                network.native(fullM3u, function (fp) {
                    if (typeof fp !== 'string') fp = String(fp);

                    const lines = fp.split('\n').map(s => s.trim()).filter(Boolean);
                    const urls  = lines.filter(l => l.startsWith('http'));

                    self.log('URLs в плейлисте: ' + urls.length);

                    // Для каждого URL пробуем разные варианты хэширования
                    let matched = false;
                    urls.forEach(function(url, i) {
                        // Вариант 1: полный URL
                        const h1 = String(hashCode(url));
                        // Вариант 2: URL без &play и &index параметров
                        const urlClean = url.replace(/&play/g, '').replace(/&index=\d+/g, '');
                        const h2 = String(hashCode(urlClean));
                        // Вариант 3: только до первого &
                        const urlBase = url.split('&')[0];
                        const h3 = String(hashCode(urlBase));
                        // Вариант 4: только путь без query
                        const urlPath = url.split('?')[0];
                        const h4 = String(hashCode(urlPath));

                        [h1, h2, h3, h4].forEach(function(h, vi) {
                            if (knownHashes.includes(h)) {
                                matched = true;
                                self.log('✓ СОВПАДЕНИЕ! Серия #' + (i+1));
                                self.log('  Вариант ' + (vi+1) + ', hash=' + h);
                                self.log('  ' + url.substring(0, 80));
                            }
                        });
                    });

                    if (!matched) {
                        self.log('Прямых совпадений нет.');
                        self.log('Пробую первые 3 URL:');
                        urls.slice(0, 3).forEach(function(url, i) {
                            self.log('#' + (i+1) + ' h=' + hashCode(url));
                            self.log(url.substring(0, 70));
                        });
                    }
                }, function() { self.log('Ошибка плейлиста'); }, false, { dataType: 'text' });
            }, function() { self.log('Ошибка торрентов'); });

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.log = function (msg) {
            html.find('.loading_debug').append($('<div>').text(msg));
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
                Lampa.Activity.push({ title: 'Хэш', component: 'test_plugin', page: 1 });
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
