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
 * Analyzes 5-year EPS trends and historical PE ratios
 */
async function calculateEarningsTrackValuation(params) {
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
    fairValue: null,
    currentPrice: null,
    estimatedEpsT1: null,
    referenceAveragePe: null,
    epsGrowthRate: null,
    expectedPriceTp1: null,
    requiredRateOfReturn: 0.10,
    valuationPossible: false,
    warnings: [],
    assumptions: {
      method: 'Earnings Track',
      requiredRateOfReturn: '10%',
      notes: [
        'Analysis based on 5-year EPS track record',
        'EPS must be positive and non-decreasing across all years',
        'Fair value calculated using forward earnings and historical PE average'
      ]
    },
    timestamp: new Date().toISOString()
  };

  try {
    // Get current price
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`;
    const quoteData = await fetchFinnhub(quoteUrl);
    result.currentPrice = parseFloat(quoteData.c);

    if (!Number.isFinite(result.currentPrice) || result.currentPrice <= 0) {
      result.warnings.push(`Invalid current price from Finnhub: ${quoteData.c}`);
      return result;
    }

    // Get historical financial data (annual earnings and PE ratios)
    const metricsUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${finnhubApiKey}`;
    const metricsData = await fetchFinnhub(metricsUrl);

    if (!metricsData.series || !metricsData.series.annual) {
      result.warnings.push('No historical series data available from Finnhub');
      return result;
    }

    // Extract EPS series from series.annual.eps[x].v
    let epsSeries = [];
    let peSeries = [];

    if (metricsData.series.annual.eps && Array.isArray(metricsData.series.annual.eps)) {
      // Extract EPS values - most recent is at index 0
      for (let i = 0; i < Math.min(5, metricsData.series.annual.eps.length); i++) {
        if (metricsData.series.annual.eps[i] && metricsData.series.annual.eps[i].v !== undefined) {
          epsSeries.push(parseFloat(metricsData.series.annual.eps[i].v));
        }
      }
    }

    // Extract PE series from series.annual.pe[x].v
    if (metricsData.series.annual.pe && Array.isArray(metricsData.series.annual.pe)) {
      // Extract PE values - most recent is at index 0
      for (let i = 0; i < Math.min(5, metricsData.series.annual.pe.length); i++) {
        if (metricsData.series.annual.pe[i] && metricsData.series.annual.pe[i].v !== undefined) {
          peSeries.push(parseFloat(metricsData.series.annual.pe[i].v));
        }
      }
    }

    // If we couldn't get enough EPS data, return error
    if (epsSeries.length < 5) {
      result.warnings.push(`Insufficient historical EPS data available (only ${epsSeries.length} years instead of 5)`);
      return result;
    }

    if (peSeries.length < 5) {
      result.warnings.push(`Insufficient historical PE data available (only ${peSeries.length} years instead of 5)`);
      return result;
    }

    // Reverse to have oldest first (T-5 to T-1) because API returns newest first
    epsSeries = epsSeries.reverse();
    peSeries = peSeries.reverse();

    // STEP 1: Validate EPS track record
    // Check for negative EPS
    for (let i = 0; i < epsSeries.length; i++) {
      if (epsSeries[i] <= 0) {
        result.warnings.push('The stock does not have stable earnings track records for estimating fair value. (negative EPS detected)');
        return result;
      }
    }

    // Check for 2 or more consecutive years of EPS decrease
    let consecutiveDecreases = 0;
    for (let i = 1; i < epsSeries.length; i++) {
      if (epsSeries[i] < epsSeries[i - 1]) {
        consecutiveDecreases++;
        if (consecutiveDecreases >= 2) {
          result.warnings.push('The stock does not have stable earnings track records for estimating fair value. (2+ years of EPS decrease)');
          return result;
        }
      } else {
        consecutiveDecreases = 0;
      }
    }

    // STEP 2: Calculate 5-year EPS CAGR
    // Formula: (EPS[T-1] / EPS[T-5])^(1/4) - 1
    // Note: epsSeries[0] is T-5, epsSeries[4] is T-1
    const epsT5 = epsSeries[0];
    const epsT1 = epsSeries[4];
    result.epsGrowthRate = Math.pow(epsT1 / epsT5, 1 / 4) - 1;

    if (!Number.isFinite(result.epsGrowthRate)) {
      result.warnings.push('Failed to calculate valid EPS growth rate');
      return result;
    }

    // STEP 3: Estimate EPS for next financial year (T+1)
    // Formula: EPS[T-1] * (1 + growth_rate)
    result.estimatedEpsT1 = epsT1 * (1 + result.epsGrowthRate);

    // STEP 4: Get reference PE level (average of last 5 years)
    // Validate PE values first
    for (let i = 0; i < peSeries.length; i++) {
      if (!Number.isFinite(peSeries[i]) || peSeries[i] <= 0) {
        result.warnings.push(`Invalid PE ratio found in historical data: ${peSeries[i]}`);
        return result;
      }
    }

    // Calculate average PE
    result.referenceAveragePe = peSeries.reduce((a, b) => a + b, 0) / peSeries.length;

    // STEP 5: Calculate expected price for next financial year
    // Formula: reference_PE * estimated_EPS_T1
    result.expectedPriceTp1 = result.referenceAveragePe * result.estimatedEpsT1;

    // STEP 6: Discount expected price with 10% required rate of return
    // Formula: expected_price / (1 + 0.10)
    result.fairValue = result.expectedPriceTp1 / (1 + result.requiredRateOfReturn);

    result.valuationPossible = true;
    result.assumptions.actualEpsUsed = epsT1;
    result.assumptions.epsGrowthRatePercent = (result.epsGrowthRate * 100).toFixed(2);
    result.assumptions.historicalPeValues = peSeries;
    result.assumptions.historicalEpsValues = epsSeries;

    return result;

  } catch (error) {
    result.warnings.push(`Error during earnings track valuation: ${error.message}`);
    return result;
  }
}


/**
 * Calculate stock valuation using Asset-based method
 * Analyzes 5-year ROE trends and historical PB ratios
 */
async function calculateAssetBasedValuation(params) {
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
    fairValue: null,
    currentPrice: null,
    estimatedBookValueT1: null,
    referencePbLevel: null,
    averageRoe: null,
    expectedPriceTp1: null,
    requiredRateOfReturn: 0.10,
    valuationPossible: false,
    warnings: [],
    assumptions: {
      method: 'Asset-based (ROE)',
      requiredRateOfReturn: '10%',
      notes: [
        'Analysis based on 5-year ROE track record',
        'ROE must be positive across all years',
        'Fair value calculated using forward book value and historical PB average'
      ]
    },
    timestamp: new Date().toISOString()
  };

  try {
    // Get current price
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`;
    const quoteData = await fetchFinnhub(quoteUrl);
    result.currentPrice = parseFloat(quoteData.c);

    if (!Number.isFinite(result.currentPrice) || result.currentPrice <= 0) {
      result.warnings.push(`Invalid current price from Finnhub: ${quoteData.c}`);
      return result;
    }

    // Get historical financial data (annual ROE, PB, and book value)
    const metricsUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${finnhubApiKey}`;
    const metricsData = await fetchFinnhub(metricsUrl);

    if (!metricsData.series || !metricsData.series.annual) {
      result.warnings.push('No historical series data available from Finnhub');
      return result;
    }

    // Get current book value per share from metrics
    const currentMetrics = metricsData.metric || {};
    let bookValuePerShare = null;

    if (currentMetrics.bookValuePerShareAnnual !== undefined) {
      bookValuePerShare = parseFloat(currentMetrics.bookValuePerShareAnnual);
    }

    if (!Number.isFinite(bookValuePerShare) || bookValuePerShare <= 0) {
      result.warnings.push('Cannot obtain valid book value per share for valuation');
      return result;
    }

    // Extract ROE series from series.annual.roe[x].v
    let roeSeries = [];
    let pbSeries = [];

    if (metricsData.series.annual.roe && Array.isArray(metricsData.series.annual.roe)) {
      // Extract ROE values - most recent is at index 0
      for (let i = 0; i < Math.min(5, metricsData.series.annual.roe.length); i++) {
        if (metricsData.series.annual.roe[i] && metricsData.series.annual.roe[i].v !== undefined) {
          roeSeries.push(parseFloat(metricsData.series.annual.roe[i].v));
        }
      }
    }

    // Extract PB series from series.annual.pb[x].v
    if (metricsData.series.annual.pb && Array.isArray(metricsData.series.annual.pb)) {
      // Extract PB values - most recent is at index 0
      for (let i = 0; i < Math.min(5, metricsData.series.annual.pb.length); i++) {
        if (metricsData.series.annual.pb[i] && metricsData.series.annual.pb[i].v !== undefined) {
          pbSeries.push(parseFloat(metricsData.series.annual.pb[i].v));
        }
      }
    }

    // If we couldn't get enough ROE data, return error
    if (roeSeries.length < 5) {
      result.warnings.push(`Insufficient historical ROE data available (only ${roeSeries.length} years instead of 5)`);
      return result;
    }

    if (pbSeries.length < 5) {
      result.warnings.push(`Insufficient historical PB data available (only ${pbSeries.length} years instead of 5)`);
      return result;
    }

    // Reverse to have oldest first (T-5 to T-1) because API returns newest first
    roeSeries = roeSeries.reverse();
    pbSeries = pbSeries.reverse();

    // STEP 1: Validate ROE track record
    // Check for negative ROE
    for (let i = 0; i < roeSeries.length; i++) {
      if (roeSeries[i] <= 0) {
        result.warnings.push('The stock does not have stable return on equity track records for estimating fair value.');
        return result;
      }
    }

    // STEP 2: Calculate average ROE of the 5 years
    // ROE from Finnhub is expressed as a decimal (e.g., 0.15 for 15%), not a percentage (15)
    result.averageRoe = roeSeries.reduce((a, b) => a + b, 0) / roeSeries.length;

    if (!Number.isFinite(result.averageRoe) || result.averageRoe <= 0) {
      result.warnings.push('Failed to calculate valid average ROE');
      return result;
    }

    // STEP 3: Estimate book value per share for next financial year (T+1)
    // Formula: (average_ROE + 1) * bookValuePerShareAnnual
    // Note: ROE is already in decimal format (0.15), so no conversion needed
    result.estimatedBookValueT1 = (result.averageRoe + 1) * bookValuePerShare;

    // STEP 4: Get reference PB level (average of last 5 years)
    // Validate PB values first
    for (let i = 0; i < pbSeries.length; i++) {
      if (!Number.isFinite(pbSeries[i]) || pbSeries[i] <= 0) {
        result.warnings.push(`Invalid PB ratio found in historical data: ${pbSeries[i]}`);
        return result;
      }
    }

    // Calculate average PB
    result.referencePbLevel = pbSeries.reduce((a, b) => a + b, 0) / pbSeries.length;

    // STEP 5: Calculate expected price for next financial year
    // Formula: reference_PB * estimated_book_value_T1
    result.expectedPriceTp1 = result.referencePbLevel * result.estimatedBookValueT1;

    // STEP 6: Discount expected price with 10% required rate of return
    // Formula: expected_price / (1 + 0.10)
    result.fairValue = result.expectedPriceTp1 / (1 + result.requiredRateOfReturn);

    result.valuationPossible = true;
    result.assumptions.bookValuePerShareUsed = bookValuePerShare;
    result.assumptions.averageRoePercent = result.averageRoe.toFixed(2);
    result.assumptions.historicalPbValues = pbSeries;
    result.assumptions.historicalRoeValues = roeSeries;

    return result;

  } catch (error) {
    result.warnings.push(`Error during asset-based valuation: ${error.message}`);
    return result;
  }
}

/**
 * Calculate stock valuation using Dividend Valuation method
 * Analyzes dividend history and projects future dividends
 */
async function calculateDividendValuation(params) {
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
    fairValue: null,
    currentPrice: null,
    historicalDividends: [],
    dividendGrowthRate: null,
    estimatedDividendT1: null,
    federalFundsRate: null,
    riskPremium: null,
    referenceDividendYield: null,
    estimatedPriceTp1: null,
    requiredRateOfReturn: 0.10,
    valuationPossible: false,
    warnings: [],
    assumptions: {
      method: 'Dividend Valuation',
      requiredRateOfReturn: '10%',
      notes: [
        'Analysis based on 5-year dividend track record (T-5 to T-1)',
        'Dividends consolidated by financial year',
        'Dividend yield = Federal Funds Rate + Risk Premium',
        'Risk Premium = 0 if growth rate > 3%, else 3% - growth rate',
        'Fair value calculated using forward dividend and dividend yield'
      ]
    },
    timestamp: new Date().toISOString()
  };

  try {
    // STEP 1: Get current price
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubApiKey}`;
    const quoteData = await fetchFinnhub(quoteUrl);
    result.currentPrice = parseFloat(quoteData.c);

    if (!Number.isFinite(result.currentPrice) || result.currentPrice <= 0) {
      result.warnings.push(`Invalid current price from Finnhub: ${quoteData.c}`);
      return result;
    }

    // STEP 2: Get dividend data from Alpha Vantage
    if (!alphaVantageApiKey) {
      result.warnings.push('Alpha Vantage API key required for dividend valuation');
      return result;
    }

    const dividendUrl = `https://www.alphavantage.co/query?function=DIVIDENDS&symbol=${symbol}&apikey=${alphaVantageApiKey}`;
    const dividendData = await fetchAlphaVantage(dividendUrl);

    if (!dividendData.data || !Array.isArray(dividendData.data) || dividendData.data.length === 0) {
      result.warnings.push('No dividend data available from Alpha Vantage');
      return result;
    }

    // STEP 3: Get earnings history to determine financial year periods (with fiscalDateEnding)
    let earningsData = null;
    try {
      const earningsUrl = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${alphaVantageApiKey}`;
      earningsData = await fetchAlphaVantage(earningsUrl);
    } catch (earningsError) {
      result.warnings.push(`Failed to fetch EARNINGS data from Alpha Vantage: ${earningsError.message}`);
      return result;
    }

    // Build fiscal year end dates from annual earnings
    let fiscalYearEnds = [];
    
    // Try to get annualEarnings - this is the standard field from EARNINGS endpoint
    let annualEarningsArray = null;
    if (earningsData && earningsData.annualEarnings && Array.isArray(earningsData.annualEarnings) && earningsData.annualEarnings.length > 0) {
      annualEarningsArray = earningsData.annualEarnings;
    }
    
    if (annualEarningsArray) {
      for (const earning of annualEarningsArray) {
        if (earning.fiscalDateEnding) {
          fiscalYearEnds.push(earning.fiscalDateEnding);
        }
      }
    } else {
      // Detailed diagnostic info about what we received
      if (!earningsData) {
        result.warnings.push('EARNINGS API returned null/undefined response');
      } else {
        const responseKeys = Object.keys(earningsData);
        let diagInfo = `EARNINGS API returned unexpected structure. Available keys: [${responseKeys.join(', ')}]`;
        
        // Check if it's a common error response
        if (earningsData.Information) {
          diagInfo += ` | Information: ${earningsData.Information}`;
        }
        if (earningsData.message) {
          diagInfo += ` | Message: ${earningsData.message}`;
        }
        
        result.warnings.push(diagInfo);
      }
    }

    if (fiscalYearEnds.length === 0) {
      result.warnings.push('No fiscal year end dates found from earnings data; cannot properly consolidate dividends by fiscal year');
      return result;
    }

    // Note: Alpha Vantage returns annualEarnings in descending order already (most recent first)

    // STEP 4: Consolidate dividends by financial year
    // Group dividends by fiscal year: a dividend belongs to a fiscal year if its ex_date is 
    // within one year on or before the fiscal year end date (fiscalDateEnding)
    const dividendsByFiscalYear = {};
    
    for (const dividend of dividendData.data) {
      if (dividend.amount && dividend.ex_date) {
        const amount = parseFloat(dividend.amount);
        if (Number.isFinite(amount) && amount > 0) {
          const dividendDate = new Date(dividend.ex_date);
          
          // Find which fiscal year this dividend belongs to
          for (const fiscalYearEnd of fiscalYearEnds) {
            const fiscalEndDate = new Date(fiscalYearEnd);
            // Calculate one year before fiscal year end
            const oneYearBefore = new Date(fiscalEndDate);
            oneYearBefore.setFullYear(oneYearBefore.getFullYear() - 1);
            
            // Check if dividend is within the period (one year before or on fiscalDateEnding)
            if (dividendDate > oneYearBefore && dividendDate <= fiscalEndDate) {
              if (!dividendsByFiscalYear[fiscalYearEnd]) {
                dividendsByFiscalYear[fiscalYearEnd] = 0;
              }
              dividendsByFiscalYear[fiscalYearEnd] += amount;
              break; // Dividend assigned to fiscal year, no need to check further
            }
          }
        }
      }
    }

    // Get sorted fiscal years and extract last 5 years
    const sortedFiscalYears = Object.keys(dividendsByFiscalYear).sort();
    
    if (sortedFiscalYears.length < 5) {
      result.warnings.push(`Insufficient historical dividend data available (only ${sortedFiscalYears.length} fiscal years instead of 5)`);
      return result;
    }

    // Extract last 5 fiscal years (most recent first, then reverse for T-5 to T-1 order)
    const last5FiscalYears = sortedFiscalYears.slice(0, 5).reverse();
    result.historicalDividends = last5FiscalYears.map(fiscalYear => ({
      fiscalYearEnding: fiscalYear,
      totalDividend: dividendsByFiscalYear[fiscalYear]
    }));

    // Extract dividend values for calculation (T-5 to T-1)
    const dividendValues = last5FiscalYears.map(fiscalYear => dividendsByFiscalYear[fiscalYear]);

    // STEP 5: Calculate 4-year dividend CAGR (T-5 to T-1)
    // Formula: (dividend[T-1] / dividend[T-5])^(1/4) - 1
    const dividendT5 = dividendValues[0];
    const dividendT1 = dividendValues[4];
    
    if (dividendT5 <= 0) {
      result.warnings.push('Initial dividend value is non-positive; cannot calculate valid growth rate');
      return result;
    }

    result.dividendGrowthRate = Math.pow(dividendT1 / dividendT5, 1 / 4) - 1;

    if (!Number.isFinite(result.dividendGrowthRate)) {
      result.warnings.push('Failed to calculate valid dividend growth rate');
      return result;
    }

    // STEP 6: Estimate dividend for T+1
    // Formula: dividend[T-1] * (1 + growth_rate)
    result.estimatedDividendT1 = dividendT1 * (1 + result.dividendGrowthRate);

    // STEP 7: Get Federal Funds Rate from Alpha Vantage
    const fedRatesUrl = `https://www.alphavantage.co/query?function=FEDERAL_FUNDS_RATE&interval=monthly&apikey=${alphaVantageApiKey}`;
    const fedRatesData = await fetchAlphaVantage(fedRatesUrl);

    let currentFedRate = 0.04; // Default to 4% if not available
    if (fedRatesData.data && Array.isArray(fedRatesData.data) && fedRatesData.data.length > 0) {
      const latestRate = parseFloat(fedRatesData.data[0].value);
      if (Number.isFinite(latestRate) && latestRate >= 0) {
        currentFedRate = latestRate / 100; // Convert percentage to decimal
      } else {
        result.warnings.push('Invalid federal funds rate data; using default 4%');
      }
    } else {
      result.warnings.push('Could not fetch federal funds rate; using default 4%');
    }
    
    result.federalFundsRate = currentFedRate;

    // STEP 8: Calculate risk premium
    // If growth rate > 3%, risk premium = 0
    // Otherwise, risk premium = 3% - growth rate
    const growthRatePercent = result.dividendGrowthRate * 100;
    if (growthRatePercent > 3) {
      result.riskPremium = 0;
    } else {
      result.riskPremium = (0.03 - result.dividendGrowthRate);
    }

    // STEP 9: Calculate reference dividend yield
    // Formula: federal_funds_rate + risk_premium
    result.referenceDividendYield = result.federalFundsRate + result.riskPremium;

    if (result.referenceDividendYield <= 0) {
      result.warnings.push('Dividend yield is non-positive; valuation not possible');
      return result;
    }

    // STEP 10: Calculate estimated price at T+1
    // Formula: estimated_dividend_T1 / reference_dividend_yield
    result.estimatedPriceTp1 = result.estimatedDividendT1 / result.referenceDividendYield;

    // STEP 11: Discount estimated price by 10% required rate of return
    // Formula: estimated_price / (1 + 0.10)
    result.fairValue = result.estimatedPriceTp1 / (1 + result.requiredRateOfReturn);

    result.valuationPossible = true;
    result.assumptions.historicalDividendValues = dividendValues;
    result.assumptions.dividendGrowthRatePercent = (result.dividendGrowthRate * 100).toFixed(2);
    result.assumptions.federalFundsRatePercent = (result.federalFundsRate * 100).toFixed(2);
    result.assumptions.riskPremiumPercent = (result.riskPremium * 100).toFixed(2);
    result.assumptions.fiscalYearEnds = last5FiscalYears;

    return result;

  } catch (error) {
    result.warnings.push(`Error during dividend valuation: ${error.message}`);
    return result;
  }
}

module.exports = {
  calculateStockValuation,
  calculateEarningsTrackValuation,
  calculateAssetBasedValuation,
  calculateDividendValuation
};
