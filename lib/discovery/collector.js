class Collector {
    async search() {
        throw new Error('Collector.search must be implemented');
    }
}

module.exports = Collector;
