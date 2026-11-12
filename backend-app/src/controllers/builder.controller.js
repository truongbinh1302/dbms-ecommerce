const builderService = require('../services/builder.service');
const priceQuoteService = require('../services/priceQuote.service');
const priceInsightService = require('../services/priceInsight.service');
const buildWatchService = require('../services/buildWatch.service');
const { success, error } = require('../utils/response');

const handle = (fn, message, statusCode = 200) => async (req, res) => {
  try {
    return success(res, await fn(req), message, statusCode);
  } catch (err) {
    if (err.status) return error(res, err.message, err.status, err.data);
    return error(res, err.message);
  }
};

module.exports = {
  listComponents: handle(() => builderService.listComponents(), 'Components retrieved'),
  listPresets: handle(async () => builderService.listPresets(), 'Presets retrieved'),
  checkBuild: handle((req) => builderService.checkConfiguration((req.body || {}).items), 'Build checked'),
  autoBuild: handle((req) => builderService.autoBuildPreset(String((req.body || {}).presetId || '')), 'Build suggested'),
  advise: handle((req) => builderService.adviseFromText((req.body || {}).text), 'Advice ready'),
  suggestUpgrades: handle((req) => builderService.suggestUpgrades(req.body || {}), 'Upgrade options retrieved'),
  createQuote: handle((req) => priceQuoteService.createQuote(req.user ? req.user.id : null, req.body || {}), 'Quote created', 201),
  getQuote: handle((req) => priceQuoteService.getQuote(req.params.code), 'Quote retrieved'),
  priceTrend: handle(
    (req) => priceInsightService.getBuildPriceTrend(buildWatchService.canonicalItems((req.body || {}).items), { days: (req.body || {}).days }),
    'Price trend retrieved',
  ),
  listWatches: handle((req) => buildWatchService.listBuildWatches(req.user.id), 'Build watches retrieved'),
  watch: handle((req) => buildWatchService.watchBuild(req.user.id, req.body || {}), 'Build watched', 201),
  unwatch: handle((req) => buildWatchService.unwatchBuild(req.user.id, req.params.id), 'Build unwatched'),
};
