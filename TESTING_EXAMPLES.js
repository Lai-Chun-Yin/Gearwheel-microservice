/**
 * Example API Testing Guide
 * 
 * This file contains example requests for testing the PEG Stock Valuation Microservice
 * You can use these with curl, Postman, or any HTTP client
 */

// ============================================================
// CURL Examples
// ============================================================

// 1. Health Check
// curl http://localhost:3000/health

// 2. Get API Documentation
// curl http://localhost:3000/api/docs

// 3. Calculate valuation for Apple (US) - With API keys in .env
// curl "http://localhost:3000/api/valuation?symbol=AAPL"

// 3b. Calculate valuation for Apple (US) - With API keys in query parameters
// curl "http://localhost:3000/api/valuation?symbol=AAPL&finnhubApiKey=YOUR_FINNHUB_KEY_HERE&alphaVantageApiKey=YOUR_ALPHA_VANTAGE_KEY_HERE&market=US&marketGrowthRatePercent=10"

// 4. Calculate valuation for Tencent (Hong Kong) - API keys from .env
// curl "http://localhost:3000/api/valuation?symbol=0700.HK&market=HK"

// 4b. Calculate valuation for Tencent (Hong Kong) - With API keys in query
// curl "http://localhost:3000/api/valuation?symbol=0700.HK&finnhubApiKey=YOUR_FINNHUB_KEY_HERE&market=HK&marketGrowthRatePercent=10"

// 5. Batch valuation - API keys from .env
// curl "http://localhost:3000/api/valuation/batch?symbols=AAPL,MSFT,GOOGL"

// 5b. Batch valuation - API keys in query parameters
// curl "http://localhost:3000/api/valuation/batch?symbols=AAPL,MSFT,GOOGL&finnhubApiKey=YOUR_FINNHUB_KEY_HERE&alphaVantageApiKey=YOUR_ALPHA_VANTAGE_KEY_HERE"

// 5c. Batch valuation - Mixed markets
// curl "http://localhost:3000/api/valuation/batch?symbols=AAPL,0700.HK,MSFT&markets=US,HK,US"

// ============================================================
// JavaScript Fetch Examples
// ============================================================

// Health check
async function checkHealth() {
  const response = await fetch('http://localhost:3000/health');
  const data = await response.json();
  console.log('Health:', data);
}

// Get valuation with API keys in .env
async function getValuation(symbol, market = 'US') {
  const params = new URLSearchParams({
    symbol,
    market
  });
  const response = await fetch(`http://localhost:3000/api/valuation?${params}`);
  const result = await response.json();
  return result;
}

// Get valuation with API keys in query parameters
async function getValuationWithKeys(symbol, finnhubKey, alphaVantageKey, market = 'US') {
  const params = new URLSearchParams({
    symbol,
    finnhubApiKey: finnhubKey,
    alphaVantageApiKey: alphaVantageKey,
    market,
    marketGrowthRatePercent: 10
  });
  const response = await fetch(`http://localhost:3000/api/valuation?${params}`);
  const result = await response.json();
  return result;
}

// Batch valuation with API keys in .env
async function batchValuation(symbols, markets = null) {
  const params = new URLSearchParams({
    symbols: symbols.join(',')
  });
  if (markets) {
    params.append('markets', markets.join(','));
  }
  const response = await fetch(`http://localhost:3000/api/valuation/batch?${params}`);
  const result = await response.json();
  return result;
}

// Batch valuation with API keys in query parameters
async function batchValuationWithKeys(symbols, finnhubKey, alphaVantageKey, markets = null) {
  const params = new URLSearchParams({
    symbols: symbols.join(','),
    finnhubApiKey: finnhubKey,
    alphaVantageApiKey: alphaVantageKey
  });
  if (markets) {
    params.append('markets', markets.join(','));
  }
  const response = await fetch(`http://localhost:3000/api/valuation/batch?${params}`);
  const result = await response.json();
  return result;
}

// Example usage:
// const valuation = await getValuation('AAPL');
// console.log(`Fair value: $${valuation.fairValue}`);
//
// Or with keys:
// const valuation = await getValuationWithKeys('AAPL', 'your-key', 'your-key');
// console.log(`Fair value: $${valuation.fairValue}`);
//
// Batch example:
// const batch = await batchValuation(['AAPL', 'MSFT', '0700.HK'], ['US', 'US', 'HK']);
// console.log(`Processed ${batch.count} stocks`);

// ============================================================
// PowerShell Examples
// ============================================================

// Health check
// $response = Invoke-RestMethod -Uri "http://localhost:3000/health" `
//   -Method Get
// Write-Host $response

// Get valuation with API keys from .env
// $response = Invoke-RestMethod -Uri "http://localhost:3000/api/valuation?symbol=AAPL" `
//   -Method Get
// Write-Host $response

// Get valuation with API keys in query
// $url = "http://localhost:3000/api/valuation?symbol=AAPL&finnhubApiKey=YOUR_KEY&alphaVantageApiKey=YOUR_KEY"
// $response = Invoke-RestMethod -Uri $url -Method Get
// Write-Host $response

// Batch valuation
// $url = "http://localhost:3000/api/valuation/batch?symbols=AAPL,MSFT,GOOGL"
// $response = Invoke-RestMethod -Uri $url -Method Get
// Write-Host $response

// ============================================================
// Expected Response Example
// ============================================================

/*
{
  "symbol": "AAPL",
  "market": "US",
  "currentPrice": 150.25,
  "fairValue": 165.80,
  "marketPe": 25.5,
  "marketPeg": 2.55,
  "stockPe": 28.3,
  "stockPeg": 2.12,
  "beta": 1.15,
  "actualEps": 5.31,
  "estimatedEps": 6.05,
  "growthRate": 0.1393,
  "valuationPossible": true,
  "hasForwardEps": true,
  "betaFallbackUsed": false,
  "warnings": [],
  "assumptions": {
    "marketGrowthRatePercent": 10,
    "notes": [
      "Market PE obtained from SPY ETF via Finnhub",
      "Growth rate calculated as estimatedEps / actualEps - 1",
      "PEG formulas follow standard definition (PE divided by earnings growth in percent)",
      "Fair value = price * (market PEG * beta / stock PEG)",
      "Stock metrics from Finnhub API (https://finnhub.io/docs/api/)",
      "Estimated EPS from Alpha Vantage (https://www.alphavantage.co/documentation/#earnings-estimates)"
    ]
  }
}
*/

// ============================================================
// Test Cases
// ============================================================

/*
1. VALID REQUEST - Single US Stock
   GET /api/valuation?symbol=AAPL
   Expected: 200 with full valuation object

2. VALID REQUEST - HK Stock
   GET /api/valuation?symbol=0700.HK&market=HK
   Expected: 200 with full valuation object

3. INVALID REQUEST - Missing API Key
   GET /api/valuation?symbol=AAPL
   (with no FINNHUB_API_KEY env var)
   Expected: 400 Bad Request

4. INVALID REQUEST - Invalid Market
   GET /api/valuation?symbol=AAPL&market=INVALID
   Expected: 400 Bad Request

5. INVALID REQUEST - Invalid Growth Rate
   GET /api/valuation?symbol=AAPL&marketGrowthRatePercent=-5
   Expected: 400 Bad Request

6. BATCH REQUEST - Multiple Stocks
   GET /api/valuation/batch?symbols=AAPL,MSFT,GOOGL
   Expected: 200 with array of results

7. BATCH REQUEST - Mixed Markets
   GET /api/valuation/batch?symbols=AAPL,0700.HK&markets=US,HK
   Expected: 200 with array of results

8. 404 - Non-existent Endpoint
   GET /api/invalid
   Expected: 404 Not Found
*/

// ============================================================
// Integration with n8n
// ============================================================

/*
To use this microservice in n8n:

1. Add an "HTTP Request" node
2. Configure:
   - Method: GET
   - URL: http://localhost:3000/api/valuation
   - Authentication: None (or add if deployed with auth)
   - Query Parameters:
     - symbol: "{{ $json.symbol }}"
     - market: "{{ $json.market }}"
     - (API keys can be set in env or added as query params)

3. For batch, use:
   - Method: GET
   - URL: http://localhost:3000/api/valuation/batch
   - Query Parameters:
     - symbols: "{{ $json.symbols }}" (comma-separated)
     - markets: "{{ $json.markets }}" (comma-separated, optional)

4. The next node gets the output directly from the HTTP response
*/

module.exports = {};
