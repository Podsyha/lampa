(function () {
    'use strict';

    function TestComponent(object) {
        const scroll = new Lampa.Scroll({ mask: true, over: true });
        const html   = $('<div></div>');

        this.create = function () {
            html.append(scroll.render());
            scroll.append($(`
                <div class="about" style="padding:2rem">
                    <h1 class="loading_title" style="font-size:1.4em">Storage с позицией</h1>
                    <div class="loading_debug" style="font-size:.8em;color:#ddd;margin-top:1rem;line-height:2"></div>
                </div>
            `));
            return this.render();
        };

        this.start = function () {
            const self = this;
            let found  = 0;

            try {
                // Только ключи с ненулевым time
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    const v = localStorage.getItem(k) || '';
                    // Ищем любое "time": где значение не 0
                    if (/"time"\s*:\s*[1-9]/.test(v)) {
                        self.log('<b style="color:#8af">' + k + '</b>');
                        // Парсим и показываем только time/percent/duration
                        try {
                            const obj = JSON.parse(v);
                            // Если это объект объектов (file_view)
                            if (typeof obj === 'object') {
                                Object.entries(obj).forEach(([id, val]) => {
                                    if (val && val.time > 0) {
                                        self.log('  [' + id + '] t=' + val.time + 's ' + (val.percent||0) + '%');
                                        found++;
                                    }
                                });
                            }
                        } catch(e) {
                            self.log('  ' + v.substring(0, 80));
                            found++;
                        }
                    }
                }
                if (!found) self.log('Ничего не найдено.\nПосмотри серию через Lampa\nи зайди снова.');
            } catch(e) {
                self.log('Ошибка: ' + e.message);
            }

            Lampa.Controller.add('content', {
                toggle() {},
                back() { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.log = function (msg) {
            html.find('.loading_debug').append($('<div>').html(msg));
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
                Lampa.Activity.push({ title: 'Storage', component: 'test_plugin', page: 1 });
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
