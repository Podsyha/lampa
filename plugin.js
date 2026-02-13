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
                    <div class="loading_debug" style="font-size:.75em;color:#aaa;margin-top:1.5rem;line-height:1.9;word-break:break-all"></div>
                </div>
            `));
            return this.render();
        };

        this.start = function () {
            const self = this;
            const ts = Lampa.Torserver;

            // Глубокий осмотр Lampa.Torserver
            this.log('<b style="color:#fff">Тип:</b> ' + typeof ts);
            this.log('<b style="color:#fff">Own keys:</b> ' + Object.keys(ts).join(', '));
            try {
                const proto = Object.getPrototypeOf(ts);
                this.log('<b style="color:#fff">Proto keys:</b> ' + Object.getOwnPropertyNames(proto).join(', '));
            } catch(e) {}

            // Печатаем строковое представление каждого метода (первые 80 символов)
            Object.keys(ts).forEach(function(key) {
                if (typeof ts[key] === 'function') {
                    self.log('<b style="color:#8f8">' + key + ':</b> ' + String(ts[key]).substring(0, 120).replace(/\n/g, ' '));
                } else {
                    self.log('<b style="color:#8af">' + key + ':</b> ' + JSON.stringify(ts[key]));
                }
            });

            // Что хранится в Storage под ключами torrserver
            const allKeys = ['torrserver_url', 'torrserver_url_two', 'ts_url', 'torserver', 'torserver_url'];
            this.log('<br><b style="color:#fff">Storage:</b>');
            allKeys.forEach(function(k) {
                const v = Lampa.Storage.get(k);
                if (v) self.log(k + ' = ' + v);
            });

            // Точный URL который сейчас строит наш код
            const rawUrl = Lampa.Storage.get('torrserver_url') || Lampa.Storage.get('torrserver_url_two') || '';
            this.log('<br><b style="color:#fff">rawUrl:</b> [' + rawUrl + ']');
            this.log('length: ' + rawUrl.length);
            // Коды первых символов — покажет невидимые символы
            let codes = '';
            for (let i = 0; i < Math.min(rawUrl.length, 30); i++) codes += rawUrl.charCodeAt(i) + ' ';
            this.log('charCodes: ' + codes);

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
