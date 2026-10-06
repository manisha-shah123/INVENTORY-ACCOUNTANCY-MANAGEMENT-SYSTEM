const { AsyncLocalStorage } = require("async_hooks");

// Holds the current request's companyId for the lifetime of that request,
// without having to thread it through every single function call manually.
const tenantStorage = new AsyncLocalStorage();

/**
 * Runs `callback` with `companyId` available to anything called
 * (directly or indirectly, sync or async) from within it.
 */
const runWithCompany = (companyId, callback) => {
  return tenantStorage.run({ companyId }, callback);
};

/**
 * Reads the companyId for the currently-executing request.
 * Returns undefined if called outside of a request (e.g. a one-off script).
 */
const getCurrentCompanyId = () => {
  const store = tenantStorage.getStore();
  return store ? store.companyId : undefined;
};

module.exports = { runWithCompany, getCurrentCompanyId };
