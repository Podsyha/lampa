(function () {
    'use strict';

    function TestComponent(object) {
        const scroll = new Lampa.Scroll({ mask: true, over: true });
        const html   = $('<div></div>');

        this.create = function () {
            html.append(scroll.render());
            scroll.append($(`
                <div class="about" style="padding:2rem">
                    <h1 class="loading_title" style="font-size:1.2em">Перехват записи</h1>
                    <p style="color:#aaa;font-size:.8em">Запусти серию через Lampa,<br>посмотри 1 мин, выйди назад,<br>снова открой этот экран</p>
                    <div class="loading_debug" style="font-size:.75em;color:#ddd;margin-top:1rem;line-height:1.9;word-break:break-all"></div>
                </div>
            `));
            return this.render();
        };

        this.start = function () {
            const self = this;

            // Перехватываем setItem чтобы поймать запись позиции в реальном времени
            const origSetItem = localStorage.setItem.bind(localStorage);
            localStorage.setItem = function(key, value) {
                if (key.indexOf('file_view') >= 0 || key.indexOf('timeline') >= 0) {
                    self.log('ЗАПИСЬ: ' + key);
                    self.log('  ' + String(value).substring(0, 150));
                }
                return origSetItem(key, value);
            };

            self.log('Слушаю localStorage...');
            self.log('Открой серию и выйди назад');

            // Также показываем текущее состояние file_view на ТВ
            self.log('─────────────────');
            self.log('Текущий file_view:');
            try {
                Object.keys(localStorage)
                    .filter(k => k.startsWith('file_view'))
                    .forEach(function(key) {
                        const fv = JSON.parse(localStorage.getItem(key) || '{}');
                        const nonzero = Object.entries(fv).filter(([k,v]) => v.time > 0);
                        self.log(key + ': ' + nonzero.length + ' записей с time>0');
                        nonzero.slice(0,3).forEach(([k,v]) => {
                            self.log('  [' + k + '] t=' + Math.round(v.time) + 's ' + v.percent + '%');
                        });
                    });
            } catch(e) {
                self.log('Ошибка: ' + e.message);
            }

            Lampa.Controller.add('content', {
                toggle() {},
                back() {
                    // Восстанавливаем оригинальный setItem при выходе
                    localStorage.setItem = origSetItem;
                    Lampa.Activity.backward();
                }
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
                Lampa.Activity.push({ title: 'Перехват', component: 'test_plugin', page: 1 });
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
