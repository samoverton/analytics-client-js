(function(){

    /**
     * @param {Object} def
     * @constructor
     */
    function Field(def) {
        for(var key in def) {
            this[key] = def[key];
        }
    }

    module.exports = Field;

})();


