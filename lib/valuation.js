/**
 * Stock Fair Value Calculator Module
 * Calculates fair value using PEG-based valuation model
 * Supports US (S&P 500) and HK (Hang Seng) markets
 */

// Helper function to fetch JSON from Finnhub API
async function fetchFinnhub(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error(`Finnhub API call failed: ${error.message}`);
  }
}

// Helper function to fetch JSON from Alpha Vantage API
async function fetchAlphaVantage(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    const data = await response.json();
    if (data.Note) {
      throw new Error(`API rate limit exceeded: ${data.Note}`);
    }
    if (data.Error && data.Error !== 'None') {
      throw new Error(data.Error);
    }
    return data;
  } catch (error) {
    throw new Error(`Alpha Vantage API call failed: ${error.message}`);
  }
}

// Get market PE ratio via ETF (SPY for US, 2800.HK for HK)
async function getMarketPe(market, apiKey) {
  const etfSymbol = market === 'HK' ? '2800' : 'SPY';
  const url = `https://finnhub.io/api/v1/stock/metric?symbol=${etfSymbol}&metric=all&token=${apiKey}`;
  
  try {
    const data = await fetchFinnhub(url);
    
    // Finnhub returns metrics in the 'metric' object
    let pe = null;
    if (data.metric) {
      // Try peNormalizedAnnual first, then peAnnual
      pe = data.metric.peNormalizedAnnual !== undefined ? 
           parseFloat(data.metric.peNormalizedAnnual) : 
           (data.metric.peAnnual !== undefined ? parseFloat(data.metric.peAnnual) : null);
    }
    
    if (!Number.isFinite(pe) || pe <= 0) {
      throw new Error(`Invalid PE ratio for ${etfSymbol}: ${pe}`);
    }
    
    return pe;
  } catch (error) {
    throw new Error(`Failed to get market PE for ${market}: ${error.message}`);
  }
}

// Get stock data including beta, EPS, and price
async function getStockData(symbol, finnhubApiKey) {
  const warnings = [];
  let beta = null;
  let actualEps = null;
  let estimatedEps = null;
  let price = null;
  let pe = null;
  
  // Fetch current price via quote endpoint
  try {
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`;
    const quoteData = await fetchFinnhub(quoteUrl);
    
    price = parseFloat(quoteData.c);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Invalid price for ${symbol}: ${quoteData.c}`);
    }
  } catch (error) {
    throw new Error(`Failed to get quote for ${symbol}: ${error.message}`);
  }
  
  // Fetch metrics (beta, PE, and other fundamentals)
  try {
    const metricsUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${finnhubApiKey}`;
    const metricsData = await fetchFinnhub(metricsUrl);
    
    if (metricsData.metric) {
      const metrics = metricsData.metric;
      
      // Extract PE ratio
      if (metrics.peTTM !== undefined) {
        pe = parseFloat(metrics.peTTM);
      } else if (metrics.peExclExtraTTM !== undefined) {
        pe = parseFloat(metrics.peExclExtraTTM);
      } else if (metrics.peAnnual !== undefined) {
        pe = parseFloat(metrics.peAnnual);
      }

      // Extract EPS TTM
      if (metrics.epsTTM !== undefined) {
        actualEps = parseFloat(metrics.epsTTM);
      } else if (metrics.epsExclExtraItemsTTM !== undefined) {
        actualEps = parseFloat(metrics.epsExclExtraItemsTTM);
      } else if (metrics.epsAnnual !== undefined) {
        actualEps = parseFloat(metrics.epsAnnual);
      }
      
      if (Number.isFinite(pe) && pe <= 0) {
        pe = null;
      }

      if (!Number.isFinite(actualEps)) {
        actualEps = null;
      }
      
      // Extract Beta
      if (metrics.beta) {
        beta = parseFloat(metrics.beta);
        if (!Number.isFinite(beta) || beta < 0) {
          beta = null;
          warnings.push('Beta value was invalid; using fallback.');
        }
      }
    }
  } catch (error) {
    warnings.push(`Could not fetch metrics; some data may be unavailable: ${error.message}`);
  }
  
  // If we don't have EPS from metrics, try financials endpoint
  if (!actualEps) {
    try {
      const financialsUrl = `https://finnhub.io/api/v1/stock/financials-reported?symbol=${symbol}&freq=annual&token=${finnhubApiKey}`;
      const financialsData = await fetchFinnhub(financialsUrl);
      
      if (financialsData.data && financialsData.data.length > 0) {
        const latestFiling = financialsData.data[0];
        if (latestFiling.report) {
          // Calculate EPS from net income and shares outstanding if available
          if (latestFiling.report.ic && latestFiling.report.ic.NetIncomeLoss) {
            const netIncome = parseFloat(latestFiling.report.ic.NetIncomeLoss);
            if (Number.isFinite(netIncome) && netIncome !== 0) {
              actualEps = netIncome;
              warnings.push('Actual EPS derived from reported net income (not per share basis).');
            }
          }
        }
      }
    } catch (error) {
      warnings.push(`Could not fetch financials: ${error.message}`);
    }
  }
  
  // Note: We'll try to get estimated EPS later via Alpha Vantage if available
  // For now, mark as null; will be filled by separate Alpha Vantage call
  estimatedEps = null;
  
  // Use default beta if not available
  if (beta === null) {
    beta = 1.0;
    warnings.push('Beta value unavailable; using default beta = 1.0');
  }
  
  return {
    beta,
    actualEps,
    estimatedEps,
    price,
    pe,
    warnings
  };
}

// Calculate PEG ratio
function calculatePeg(pe, growthRateDecimal) {
  if (growthRateDecimal <= 0 || !Number.isFinite(pe) || pe <= 0) {
    return null;
  }
  return pe / (growthRateDecimal * 100);
}

// Get estimated EPS from Alpha Vantage
async function getEstimatedEpsFromAlphaVantage(symbol, apiKey) {
  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS_ESTIMATES&symbol=${symbol}&apikey=${apiKey}`;
    const data = await fetchAlphaVantage(url);
    
    if (data.estimates && data.estimates.length > 0) {
      // Get the most recent annual estimate if available
      for (const estimate of data.estimates) {
        if (estimate.date && estimate.eps_estimate_average) {
          const estimatedEps = parseFloat(estimate.eps_estimate_average);
          if (Number.isFinite(estimatedEps) && estimatedEps > 0) {
            return { eps: estimatedEps, period: estimate.date };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Calculate fair value for a stock
 * @param {Object} params - Valuation parameters
 * @param {string} params.symbol - Stock symbol
 * @param {string} params.finnhubApiKey - Finnhub API key
 * @param {string} [params.alphaVantageApiKey] - Alpha Vantage API key (optional)
 * @param {string} [params.market] - Market ('US' or 'HK', default 'US')
 * @param {number} [params.marketGrowthRatePercent] - Market growth rate (default 10)
 * @returns {Promise<Object>} Valuation result object
 */
async function calculateStockValuation(params) {
  const {
    symbol,
    finnhubApiKey,
    alphaVantageApiKey,
    market = 'US',
    marketGrowthRatePercent = 10
  } = params;

  const result = {
    symbol,
    market,
    marketPe: null,
    marketPeg: null,
    beta: null,
    actualEps: null,
    estimatedEps: null,
    stockPe: null,
    growthRate: null,
    stockPeg: null,
    currentPrice: null,
    fairValue: null,
    assumptions: {
      marketGrowthRatePercent,
      notes: [
        `Market PE obtained from ${market === 'HK' ? '2800' : 'SPY'} ETF via Finnhub`,
        'Growth rate calculated as estimatedEps / actualEps - 1',
        'PEG formulas follow standard definition (PE divided by earnings growth in percent)',
        'Fair value = price * (market PEG * beta / stock PEG)',
        'Stock metrics from Finnhub API (https://finnhub.io/docs/api/)',
        'Estimated EPS from Alpha Vantage (https://www.alphavantage.co/documentation/#earnings-estimates)'
      ]
    },
    warnings: [],
    hasForwardEps: false,
    betaFallbackUsed: false,
    valuationPossible: false
  };
  
  try {
    // Step 1: Get market PE
    //result.marketPe = await getMarketPe(market, finnhubApiKey);
    //result.marketPeg = result.marketPe / marketGrowthRatePercent;
    result.marketPe = 29;
    result.marketPeg = result.marketPe / 13.5;
    
    // Step 2: Get stock data from Finnhub
    const stockData = await getStockData(symbol, finnhubApiKey);
    result.beta = stockData.beta;
    result.actualEps = stockData.actualEps;
    result.estimatedEps = stockData.estimatedEps;
    result.currentPrice = stockData.price;
    result.warnings = result.warnings.concat(stockData.warnings);
    
    // Step 2b: Get estimated EPS from Alpha Vantage if not found
    if (!Number.isFinite(result.estimatedEps) && alphaVantageApiKey) {
      const alphaEstimate = await getEstimatedEpsFromAlphaVantage(symbol, alphaVantageApiKey);
      if (alphaEstimate) {
        result.estimatedEps = alphaEstimate.eps;
        result.warnings.push(`Estimated EPS from Alpha Vantage for period ${alphaEstimate.period}`);
      }
    }
    
    if (stockData.beta !== 1.0 || stockData.warnings.some(w => w.includes('default'))) {
      // Check if beta was actually fetched vs defaulted
      if (stockData.warnings.some(w => w.includes('default beta'))) {
        result.betaFallbackUsed = true;
      }
    }
    
    // Validate EPS data
    if (!Number.isFinite(result.actualEps) || !Number.isFinite(result.estimatedEps)) {
      result.warnings.push('Missing or invalid EPS data; valuation cannot be completed. Finnhub free API may not provide detailed EPS estimates.');
      result.valuationPossible = false;
      return result;
    }
    
    result.hasForwardEps = true;
    
    // Step 3: Calculate stock growth rate
    result.growthRate = (result.estimatedEps / result.actualEps) - 1;
    
    // Step 4: Determine stock PE
    if (stockData.pe !== null) {
      result.stockPe = stockData.pe;
    } else if (result.currentPrice && result.actualEps) {
      result.stockPe = result.currentPrice / result.actualEps;
      result.warnings.push('PE calculated from price / actualEps (not from API).');
    } else {
      result.warnings.push('Cannot calculate PE; price or EPS missing.');
      result.valuationPossible = false;
      return result;
    }
    
    // Step 5: Calculate stock PEG
    if (result.growthRate <= 0 || result.stockPe <= 0) {
      result.warnings.push('Growth rate or PE is non-positive; PEG-based valuation not meaningful.');
      result.valuationPossible = false;
      return result;
    }
    
    result.stockPeg = calculatePeg(result.stockPe, result.growthRate);
    
    if (result.stockPeg === null || result.stockPeg <= 0) {
      result.warnings.push('PEG calculation resulted in non-positive value; valuation not possible.');
      result.valuationPossible = false;
      return result;
    }
    
    // Step 6: Calculate fair value
    result.fairValue = result.currentPrice * ((result.marketPeg + (result.beta - 1) * 0.7 * result.marketPeg) / result.stockPeg);
    result.valuationPossible = true;
    
  } catch (error) {
    result.warnings.push(`Error during calculation: ${error.message}`);
    result.valuationPossible = false;
  }
  
  return result;
}

/**
 * Calculate stock valuation using Earnings Track method
 * Placeholder for earnings track based valuation logic
 */
async function calculateEarningsTrackValuation(params) {
  const {
    symbol,
    finnhubApiKey,
    alphaVantageApiKey,
    market = 'US',
    marketGrowthRatePercent = 10
  } = params;

  // TODO: Implement earnings track valuation logic
  return {
    symbol,
    market,
    method: 'earnings_track',
    fairValue: null,
    valuationPossible: false,
    message: 'Earnings Track valuation method implementation pending',
    warnings: ['Method not yet implemented'],
    timestamp: new Date().toISOString()
  };
}

/**
 * Calculate stock valuation using Asset-based method
 * Placeholder for asset-based valuation logic
 */
async function calculateAssetBasedValuation(params) {
  const {
    symbol,
    finnhubApiKey,
    alphaVantageApiKey,
    market = 'US',
    marketGrowthRatePercent = 10
  } = params;

  // TODO: Implement asset-based valuation logic
  return {
    symbol,
    market,
    method: 'asset_based',
    fairValue: null,
    valuationPossible: false,
    message: 'Asset-based valuation method implementation pending',
    warnings: ['Method not yet implemented'],
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  calculateStockValuation,
  calculateEarningsTrackValuation,
  calculateAssetBasedValuation
};
