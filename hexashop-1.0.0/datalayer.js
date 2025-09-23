//import config from './DataLayer_configFile.json' assert { type: "json" };
// script.js
let config ={};
fetch("./DataLayer_configFile.json")
  .then(res => res.json())
  .then(data => {
    config = data;   // ✅ update global config
    console.log("JSON Data5:", config);
  
  })
  .catch(err => console.error(err));

window.adobeDataLayer = window.adobeDataLayer || [];


const firedPageLoads = new Set();
const clickListenersSet = new WeakSet();
const valueTrackers = {};
const visibilityStates = {};


function isVisible(element) {
  if (!element) return false;
  const style = getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    element.offsetParent !== null
  );
}


function resolveSelectorText(selector) {
  try {
    const elements = document.querySelectorAll(selector);
    return Array.from(elements)
      .map(el => el.innerText.trim())
      .filter(Boolean)
      .join(' | ');
  } catch (e) {
    return selector || '';
  }
}


function safeEval(expression, context = {}) {
  try {
    if (typeof expression !== 'string' || expression.trim() === '') return '';
    if (
      expression.trim()[0] === '<' ||
      expression.trim()[0] === '[' ||
      expression.trim().startsWith('.') 
    ) {
      return expression;
    }
    const func = new Function("with(this) { return " + expression + "; }");
    return func.call({ ...window, ...context });
  } catch (e) {
    return expression;
  }
}


function buildData(obj, context = {}) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    const value = obj[key];
    if (typeof value === 'string') {
      if (
        (/[s>#.]/.test(value) && 
         !value.includes('window.') &&
         !value.includes('navigator.') &&
         !value.includes('document.') &&
         !/[=();{}]/.test(value)
        )
      ) {
        result[key] = resolveSelectorText(value);
      } else {
        result[key] = safeEval(value, context);
      }
    } else if (typeof value === 'object') {
      result[key] = buildData(value, context);
    } else {
      result[key] = value;
    }
  }
  return result;
}


function handleEvent(eventType, key, conf, context = {}) {
  console.log('fired inside handleevent')
  const source = typeof conf?.event === 'object' ? conf.event : conf;
  const page = buildData(source.page || {}, context);
  const user = buildData(source.user || {}, context);
  const product = buildData(source.product || {}, context);
  console.log('fired inside handleevent:page', page);

  if (!product.productInfo) product.productInfo = {};
  if (!product.productInfo.productDetails && source.product?.productInfo) {
    const values = Object.values(source.product.productInfo)
      .map(expr => safeEval(expr, context))
      .filter(Boolean);
    product.productInfo.productDetails = `;${values.join('|')};;;;;`;
  }

  const payload = {
    event: source.event || eventType,
    interactionType: source.interactionType || eventType,
    page,
    user,
    product,
  };
  console.log('fired inside handleevent:payload', payload);
  window.adobeDataLayer.push(payload);
  console.log(`[DATALAYER] ${eventType} for ${key}:`, payload);
}


function handlePageLoad(key, conf, context = {}, force = false) {
  console.log('inside handlePageLoad Method');
  if (!conf?.pageload) return;
  const fireKey = key + ":pageload";
  if (!force && firedPageLoads.has(fireKey)) return;
  handleEvent('page_load', key, conf.pageload, context);
  if (!force) firedPageLoads.add(fireKey);
}


function setupClickHandlers(key, conf) {
  if (!conf?.click) return;
  const clickConfigs = Array.isArray(conf.click) ? conf.click : [conf.click];
  clickConfigs.forEach(clickConfig => {
    const selectors = Array.isArray(clickConfig.btn) ? clickConfig.btn : [clickConfig.btn];
    selectors.forEach(selectorOrExpr => {
      let elements = [];
      try {
        if (selectorOrExpr.trim().startsWith('document') ||
            selectorOrExpr.trim().startsWith('Array.from') ||
            selectorOrExpr.trim().includes('?')) {
          const result = safeEval(selectorOrExpr);
          if (result && typeof result === 'object' && result.length !== undefined) {
            elements = Array.from(result);
          }
        } else {
          elements = Array.from(document.querySelectorAll(selectorOrExpr));
        }
      } catch (e) {}
      elements.forEach(el => {
        if (!clickListenersSet.has(el) && isVisible(el)) {
          el.addEventListener('click', e => {
            setTimeout(() => handleEvent('click', key, clickConfig, e.currentTarget), 1);
          });
          clickListenersSet.add(el);
        }
      });
    });
  });
}


function handleValueChange(componentKey, selectorOrExpr, pageConfig) {
  let currentValue = '';
  if (typeof selectorOrExpr === 'string' &&
    (/[s>#.]/.test(selectorOrExpr) &&
     !selectorOrExpr.includes('window.') &&
     !selectorOrExpr.includes('document.') &&
     !selectorOrExpr.includes('navigator.') &&
     !/[=();{}]/.test(selectorOrExpr)
    )) {
    currentValue = resolveSelectorText(selectorOrExpr);
  } else {
    try {
      currentValue = safeEval(selectorOrExpr);
    } catch (e) {}
  }

  if (!valueTrackers.hasOwnProperty(componentKey)) {
    valueTrackers[componentKey] = currentValue;
    return;
  }
  if (valueTrackers[componentKey] !== currentValue) {
    valueTrackers[componentKey] = currentValue;
    handlePageLoad(componentKey, pageConfig, {}, true);
  }
}


function getCurrentPageKey() {
  console.log('fired inside getCurrentPageKey');
  const currentPath = window.location.pathname;
  const currentHash = window.location.hash || "";
  for (const pageKey in config) {
    console.log('fired getCurrentPageKey :pageKey',pageKey);
    const pageConfig = config[pageKey];
     console.log('fired getCurrentPageKey :pageConfig',pageConfig);
    const configUrl = (pageConfig.url || "");
    const configHash = pageConfig.hash || "";
    const urlMatches = currentPath === configUrl;
    const hashMatches = !configHash || currentHash === configHash;
    console.log('fired getCurrentPageKey :urlMatches',urlMatches);
    if (urlMatches && hashMatches) {
      return pageKey;
    }
  }
  return "Global Page";
}


function scanAndTriggerUnified() {
  console.log('fired scanAndTriggerUnified');
  let matchedByComponent = false;
console.log('fired scanAndTriggerUnified config:', config)
/*
  for (const key in config) {
      console.log('fired scanAndTriggerUnified inside for');
    const conf = config[key];
     console.log('fired scanAndTriggerUnified inside for conf', conf);
    const selectorOrExpr = conf.componentSelector;
    let visible = false;
 console.log('fired scanAndTriggerUnified inside for selectorOrexpr', selectorOrExpr);
    if (selectorOrExpr) {
      console.log('fired scanAndTriggerUnified inside IFF');
      let result = null;
      try {
        if (
          selectorOrExpr.trim().startsWith('document') ||
          selectorOrExpr.trim().startsWith('Array.from') ||
          selectorOrExpr.trim().includes('?')
        ) {
          result = safeEval(selectorOrExpr);
          if (typeof result === 'string' && result.trim() !== '') visible = true;
          if (result && typeof result === 'object') {
            if (Array.isArray(result)) {
              visible = result.some(isVisible);
            } else {
              visible = isVisible(result);
            }
          }
        } else {
          const el = document.querySelector(selectorOrExpr);
          visible = el && isVisible(el);
        }
      } catch (e) {
        visible = false;
      }

      const wasVisible = visibilityStates[key] || false;
      visibilityStates[key] = visible;
      if (visible && !wasVisible) {
        handlePageLoad(key, conf, {}, true);
      }
      if (visible) {
        handleValueChange(key, selectorOrExpr, conf);
      }
    }
    if (visible) {
      matchedByComponent = true;
      setupClickHandlers(key, conf);
    }
  }
*/
console.log('fired above matchedbycomponent');
  if (!matchedByComponent) {
    console.log('fired inside matchedbycomponent');
    const currentPageKey = getCurrentPageKey();
    
    const conf = config[currentPageKey];
    if (conf) {
      handlePageLoad(currentPageKey, conf);
      setupClickHandlers(currentPageKey, conf);
    }
  }
}


function onReady() {
   console.log('inside onReady');
  scanAndTriggerUnified();
  setInterval(scanAndTriggerUnified, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onReady);
  console.log('fired onReady');
} else {
   console.log('fired onReady else');
  onReady();
}
