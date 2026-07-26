(function () {

    const plugins = [];

    window.Custom = {

        register(name, callback) {

            plugins.push({
                name,
                callback
            });

        },

        run() {

            console.group("Custom Plugins");

            plugins.forEach(plugin => {

                console.log("Loading:", plugin.name);

                plugin.callback();

            });

            console.groupEnd();

        }

    };

})();