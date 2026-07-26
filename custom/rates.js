Custom.register("Rates", function () {

    console.log("Rates Plugin Loaded");

    window.getExpRate = function () {
        return window.CUSTOM_CONFIG?.RATES?.EXP ?? 1;
    };

});