# PEG Stock Valuation Microservice

A REST API microservice for calculating fair value of stocks using a PEG (Price/Earnings to Growth) ratio-based valuation model. Supports both US and Hong Kong markets.

## Features

- 📊 **PEG-based valuation** - Calculate fair value using modern financial metrics
- 🌍 **Multi-market support** - US (S&P 500) and Hong Kong (Hang Seng) markets
- 🔄 **Dual API integration** - Finnhub (primary) + Alpha Vantage (fallback for EPS estimates)
- ⚡ **Batch processing** - Valuate multiple stocks in a single request
- 📝 **Comprehensive warnings** - Clear warnings about data availability and calculation quality
- 🏥 **Health checks** - Built-in health monitoring
- 📚 **Self-documenting API** - Integrated API documentation endpoint

## Prerequisites

- Node.js 16+ 
- npm or yarn
- Finnhub API key (free tier available at https://finnhub.io)
- Alpha Vantage API key (optional, for EPS estimates - https://www.alphavantage.co)

## Installation

1. **Clone/download the project**
   ```bash
   cd "d:\Karson\Program and script\PEG stock valuation"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create .env file**
   ```bash
   # Copy the example file
   cp .env.example .env
   
   # Edit .env and add your API keys
   # PORT=3000
   # FINNHUB_API_KEY=your_key_here
   # ALPHA_VANTAGE_API_KEY=your_optional_key
   ```

## Quick Start

### Setup Option 1: With Environment Variables (Recommended)
```bash
# 1. Install dependencies
npm install

# 2. Create .env and add your API keys
cp .env.example .env

# 3. Start the server
npm start

# 4. Call the API without providing keys in request
curl "http://localhost:3000/api/valuation?symbol=AAPL"
```

### Setup Option 2: Without Environment Variables
```bash
# 1. Install dependencies
npm install

# 2. Start the server (no .env file needed)
npm start

# 3. Provide API keys in query parameters
curl "http://localhost:3000/api/valuation?symbol=AAPL&finnhubApiKey=your-key&alphaVantageApiKey=your-key"
```

## Key Features

## API Endpoints

### 1. Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-19T10:30:00.000Z",
  "uptime": 45.23
}
```

### 2. API Documentation
```
GET /api/docs
```

Returns comprehensive API documentation including all endpoints, parameters, and examples.

### 3. Calculate Stock Valuation
```
GET /api/valuation?symbol=AAPL
```

**Query Parameters:**

Option 1 - With API Keys in Query (no environment setup needed):
```
/api/valuation?symbol=AAPL&finnhubApiKey=your-key&alphaVantageApiKey=your-key&market=US&marketGrowthRatePercent=10
```

Option 2 - With Environment Variables (keys set in .env):
```
/api/valuation?symbol=AAPL
```

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `symbol` | string | Yes | - | Stock ticker symbol (e.g., "AAPL", "0700.HK") |
| `finnhubApiKey` | string | No* | env var | Finnhub API key (or use FINNHUB_API_KEY environment variable) |
| `alphaVantageApiKey` | string | No | env var | Alpha Vantage API key (or use ALPHA_VANTAGE_API_KEY environment variable) |
| `market` | string | No | "US" | Market: "US" or "HK" |
| `marketGrowthRatePercent` | number | No | 10 | Market growth rate assumption (%) |

*`finnhubApiKey` is required - provide either in query parameter OR via `FINNHUB_API_KEY` environment variable

**Response:**
```json
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
      "Fair value = price * (market PEG * beta / stock PEG)"
    ]
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `fairValue` | number \| null | Calculated fair value; null if valuation not possible |
| `valuationPossible` | boolean | Whether valuation was successfully calculated |
| `warnings` | string[] | List of warnings about data quality/availability |
| `hasForwardEps` | boolean | Whether forward EPS estimate was found |
| `betaFallbackUsed` | boolean | Whether default beta (1.0) was used |

### 4. Batch Valuation
```
GET /api/valuation/batch?symbols=AAPL,MSFT,GOOGL
```

**Query Parameters:**

Option 1 - With API Keys in Query:
```
/api/valuation/batch?symbols=AAPL,MSFT,GOOGL&markets=US,US,US&finnhubApiKey=your-key&alphaVantageApiKey=your-key
```

Option 2 - With Environment Variables:
```
/api/valuation/batch?symbols=AAPL,MSFT,GOOGL,0700.HK&markets=US,US,US,HK
```

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `symbols` | string | Yes | - | Comma-separated list of stock symbols (e.g., "AAPL,MSFT,0700.HK") |
| `markets` | string | No | "US" for all | Comma-separated list of markets (must match symbols count or defaults to "US") |
| `finnhubApiKey` | string | No* | env var | Finnhub API key (or use FINNHUB_API_KEY environment variable) |
| `alphaVantageApiKey` | string | No | env var | Alpha Vantage API key (or use ALPHA_VANTAGE_API_KEY environment variable) |
| `marketGrowthRatePercent` | number | No | 10 | Market growth rate for all valuations (%) |

**Response:**
```json
{
  "processingTime": "2026-02-19T10:30:00.000Z",
  "count": 3,
  "results": [
    { /* valuation result for AAPL */ },
    { /* valuation result for MSFT */ },
    { /* valuation result for GOOGL */ }
  ]
}
```

## Valuation Methodology

### 7-Step Calculation Process

1. **Get Market PE** - Fetch PE ratio from market ETF (SPY for US, 2800 for HK)
2. **Calculate Market PEG** - Market PE ÷ Market Growth Rate (default 10%)
3. **Get Stock Data** - Fetch current price, beta, actual EPS, PE ratio from Finnhub
4. **Get Estimated EPS** - Fetch forward EPS from Alpha Vantage (if available)
5. **Calculate Growth Rate** - (Estimated EPS ÷ Actual EPS) - 1
6. **Calculate Stock PEG** - Stock PE ÷ Stock Growth Rate (%)
7. **Calculate Fair Value** - Current Price × (Market PEG × Beta ÷ Stock PEG)

### Key Formula

```
Fair Value = Current Price × (Market PEG × Beta) / Stock PEG
```

Where:
- **Market PEG** = Market PE / Market Growth Rate
- **Stock PEG** = Stock PE / Stock Growth Rate

### PEG Ratio Interpretation

| PEG Ratio | Interpretation |
|-----------|---|
| < 1.0 | Undervalued (good opportunity) |
| 1.0 - 2.0 | Fairly valued |
| > 2.0 | Overvalued |

## Configuration Guide

### API Key Configuration

You have two options for providing API keys:

**Option 1: Environment Variables (Recommended for microservice)**
```bash
# In .env file
FINNHUB_API_KEY=your_finnhub_key_here
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here
```

Then call the API without keys in the query parameters:
```bash
curl "http://localhost:3000/api/valuation?symbol=AAPL"
```

**Option 2: Query Parameters (For per-request overrides)**
```bash
curl "http://localhost:3000/api/valuation?symbol=AAPL&finnhubApiKey=your-key&alphaVantageApiKey=your-key"
```

**Option 3: Mixed (Environment + Query Override)**
```bash
# .env has FINNHUB_API_KEY set
# Override alphaVantageApiKey in query
curl "http://localhost:3000/api/valuation?symbol=AAPL&alphaVantageApiKey=temporary-key"
```

### Market Selection

| Market | Symbol | Description |
|--------|--------|-------------|
| `US` | SPY | S&P 500 benchmark |
| `HK` | 2800 | Hong Kong Hang Seng benchmark |

### Growth Rate Assumptions

Default is 10% for both markets. You can adjust based on:
- Historical market growth
- Analyst expectations
- Economic conditions

Example for higher growth markets:
```json
{
  "symbol": "AAPL",
  "marketGrowthRatePercent": 12,
  "finnhubApiKey": "..."
}
```

## Troubleshooting

### "Missing required fields"
- Ensure `symbol` and `finnhubApiKey` are provided
- Check for typos in field names

### "Invalid PE ratio" or "Failed to get market PE"
- Verify Finnhub API key is valid
- Check Finnhub API status at https://status.finnhub.io
- Ensure you have remaining API calls (check your Finnhub dashboard)

### "Missing or invalid EPS data"
- Verify stock symbol is correct
- Try adding `alphaVantageApiKey` for fallback EPS estimates
- Some stocks may not have forward EPS estimates available

### "API rate limit exceeded"
- Alpha Vantage free tier has 5 calls/minute limit
- Implement request throttling for batch operations
- Consider Alpha Vantage premium plan for higher limits

### Port already in use
```bash
# Use a different port
PORT=3001 npm start

# Or kill the process using port 3000
# Windows: netstat -ano | findstr :3000
```

## Error Handling

All errors follow a consistent JSON format:

```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "timestamp": "2026-02-19T10:30:00.000Z"
}
```

**HTTP Status Codes:**
- `200 OK` - Successful calculation
- `400 Bad Request` - Invalid parameters
- `404 Not Found` - Endpoint not found
- `500 Internal Server Error` - Server error (API failures, etc.)

## Project Structure

```
├── app.js                    # Express REST API server
├── lib/
│   └── valuation.js         # Core valuation logic module
├── package.json             # Node.js dependencies
├── .env.example             # Environment variable template
├── .env                      # Actual environment variables (not in git)
├── peg_valuation.js         # Original n8n script (legacy)
├── get_stock_market.json    # Additional data (legacy)
└── README.md                # This file
```

## Performance Considerations

### Request Latency
- Single stock valuation: ~2-5 seconds (depends on API response times)
- Batch (10 stocks): ~5-15 seconds (parallel processing)
- Bottleneck: External API calls to Finnhub and Alpha Vantage

### Rate Limits
- **Finnhub Free**: 60 API calls/minute
- **Alpha Vantage Free**: 5 API calls/minute
- Implement exponential backoff for production deployments

### Optimization Tips
1. Cache market PE values (refreshed daily)
2. Cache stock metrics (refreshed hourly)
3. Use batch endpoints for multiple stocks
4. Implement request queuing for high-volume scenarios

## Security Recommendations

1. **API Keys**
   - Never commit `.env` file to version control
   - Use environment variables in production
   - Rotate API keys periodically
   - Use separate API keys for development/production

2. **Input Validation**
   - All inputs are validated server-side
   - Rate limiting recommended for public deployments
   - Consider authentication/authorization for production

3. **CORS**
   - Currently allows all origins (set `cors()` with no options)
   - Configure for production to restrict specific domains

## License

MIT

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify API keys at Finnhub and Alpha Vantage dashboards
3. Check API status pages for service outages
4. Review error messages in server console

## Changelog

### v1.0.0 (2026-02-19)
- Initial release
- Single and batch valuation endpoints
- Finnhub + Alpha Vantage integration
- Market selection (US/HK)
- Health checks and API documentation
