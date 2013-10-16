(function(){

    var Field = require('./Field');

    /**
     * @param {Object} def
     * @constructor
     */
    function Table(def) {

        /**
         * @private
         * @type Object
         */
        this._def = def;

    }

    var self = Table.prototype;

    // public api
    self.getFields = getFields;

    function getFields() {
        return this._def['data'].map(function(fieldDef){
            return new Field(fieldDef);
        });
    }

    module.exports = Table;

})();


