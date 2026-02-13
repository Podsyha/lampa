(function () {
    'use strict';

    // ─── Диагностика: что доступно в этой сборке Lampa ───────────────────────
    function TestComponent(object) {
        const scroll = new Lampa.Scroll({ mask: true, over: true });
        const html   = $('<div></div>');

        this.create = function () {
            html.append(scroll.render());
            scroll.append($(`
                <div class="about" style="padding:2rem">
                    <h1 class="loading_title">Диагностика</h1>
                    <p class="loading_status">Проверяю доступные методы...</p>
                    <div class="loading_debug" style="font-size:.75em;color:#aaa;margin-top:1.5rem;line-height:1.9;word-break:break-all"></div>
                </div>
            `));
            return this.render();
        };

        this.start = function () {
            const self = this;

            // 1. Показываем всё что есть в window.Lampa
            const lampaKeys = Object.keys(window.Lampa || {}).sort().join(', ');
            this.log('<b style="color:#fff">Lampa.*:</b> ' + lampaKeys);

            // 2. Показываем всё что есть в window.Android
            const androidKeys = window.Android ? Object.keys(window.Android).join(', ') : 'отсутствует';
            this.log('<b style="color:#fff">Android.*:</b> ' + androidKeys);

            // 3. Проверяем конкретные методы
            const checks = [
                ['Lampa.Nativerequest',      !!(window.Lampa && Lampa.Nativerequest)],
                ['Lampa.Nativerequest.request', !!(window.Lampa && Lampa.Nativerequest && Lampa.Nativerequest.request)],
                ['Lampa.Nativerequest.native',  !!(window.Lampa && Lampa.Nativerequest && Lampa.Nativerequest.native)],
                ['Lampa.Reguest',            !!(window.Lampa && Lampa.Reguest)],
                ['Lampa.Utils.native',       !!(window.Lampa && Lampa.Utils && Lampa.Utils.native)],
                ['Android.request',          !!(window.Android && Android.request)],
                ['Android.fetch',            !!(window.Android && Android.fetch)],
                ['Android.network',          !!(window.Android && Android.network)],
                ['window.fetch',             !!window.fetch],
                ['XMLHttpRequest',           !!window.XMLHttpRequest],
            ];
            this.log('<br><b style="color:#fff">Проверка методов:</b>');
            checks.forEach(([name, ok]) => {
                self.log((ok ? '✓ ' : '✗ ') + name);
            });

            // 4. Проверяем что внутри Lampa.Reguest если он есть
            if (window.Lampa && Lampa.Reguest) {
                try {
                    const r = new Lampa.Reguest();
                    const rKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(r))
                        .concat(Object.keys(r)).join(', ');
                    this.log('<br><b style="color:#fff">Lampa.Reguest методы:</b> ' + rKeys);
                } catch(e) {
                    this.log('Lampa.Reguest ошибка: ' + e.message);
                }
            }

            // 5. Пробуем XMLHttpRequest напрямую (без jQuery) — он иногда работает там где $.ajax нет
            this.log('<br><b style="color:#fff">Тест XHR:</b>');
            const serverUrl = (
                Lampa.Storage.get('torrserver_url') ||
                Lampa.Storage.get('torrserver_url_two') || ''
            ).replace(/\/+$/, '');
            this.log('URL: ' + serverUrl);

            if (serverUrl && window.XMLHttpRequest) {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', serverUrl + '/echo', true);
                xhr.timeout = 8000;
                xhr.onload = function () {
                    self.log('XHR /echo — HTTP ' + xhr.status + ': ' + xhr.responseText.substring(0, 60));
                };
                xhr.onerror = function () {
                    self.log('XHR /echo — onerror (CORS или сеть)');
                };
                xhr.ontimeout = function () {
                    self.log('XHR /echo — timeout');
                };
                xhr.send();
            }

            // 6. Пробуем window.fetch если есть
            if (serverUrl && window.fetch) {
                this.log('<br><b style="color:#fff">Тест window.fetch:</b>');
                fetch(serverUrl + '/echo', { method: 'GET', mode: 'no-cors' })
                    .then(() => self.log('fetch /echo — ответил (no-cors, статус неизвестен)'))
                    .catch(e => self.log('fetch /echo — ошибка: ' + e.message));
            }

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
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
                Lampa.Activity.push({ title: 'Диагностика', component: 'test_plugin', page: 1 });
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
