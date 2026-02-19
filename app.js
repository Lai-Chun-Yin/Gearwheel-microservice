/**
 * PEG Stock Valuation Microservice
 * REST API for calculating fair value using PEG-based valuation model
 * 
 * Base URL: http://localhost:3000
 * 
 * Endpoints:
 * - POST /api/valuation - Calculate stock fair value
 * - GET /health - Health check
 * - GET /api/docs - API documentation
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { calculateStockValuation } = require('./lib/valuation');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * API Documentation endpoint
 * GET /api/docs
 */
app.get('/api/docs', (req, res) => {
  res.json({
    service: 'PEG Stock Valuation Microservice',
    version: '1.0.0',
    baseUrl: `http://localhost:${PORT}`,
    endpoints: {
      'GET /api/valuation': {
        description: 'Calculate fair value of a stock using PEG-based valuation',
        requestBody: {
          required: ['symbol'],
          optional: ['finnhubApiKey', 'alphaVantageApiKey', 'market', 'marketGrowthRatePercent'],
          notes: [
            'finnhubApiKey: provide in request OR set FINNHUB_API_KEY environment variable',
            'alphaVantageApiKey: provide in request OR set ALPHA_VANTAGE_API_KEY environment variable'
          ],
          exampleWithApiKeys: {
            symbol: 'AAPL',
            finnhubApiKey: 'your-key',
            alphaVantageApiKey: 'your-key',
            market: 'US',
            marketGrowthRatePercent: 10
          },
          exampleWithEnvironmentVars: {
            symbol: 'AAPL'
          }
        },
        response: {
          symbol: 'string',
          market: 'string',
          fairValue: 'number | null',
          currentPrice: 'number',
          beta: 'number',
          actualEps: 'number',
          estimatedEps: 'number',
          stockPe: 'number',
          stockPeg: 'number',
          growthRate: 'number',
          marketPe: 'number',
          marketPeg: 'number',
          valuationPossible: 'boolean',
          warnings: 'string[]',
          assumptions: 'object'
        }
      },
      'GET /health': {
        description: 'Service health check',
        response: {
          status: 'string',
          timestamp: 'string',
          uptime: 'number'
        }
      },
      'GET /api/docs': {
        description: 'API documentation (this endpoint)'
      }
    }
  });
});

/**
 * Calculate stock valuation
 * GET /api/valuation
 * 
 * Query parameters:
 * - symbol (required): Stock symbol
 * - finnhubApiKey (optional): Finnhub API key (or use FINNHUB_API_KEY env var)
 * - alphaVantageApiKey (optional): Alpha Vantage API key (or use ALPHA_VANTAGE_API_KEY env var)
 * - market (optional): 'US' or 'HK' (default: 'US')
 * - marketGrowthRatePercent (optional): Market growth rate (default: 10)
 */
app.get('/api/valuation', async (req, res) => {
  try {
    const { symbol, finnhubApiKey: bodyFinnhubKey, alphaVantageApiKey: bodyAlphaKey, market, marketGrowthRatePercent } = req.query;

    // Use provided keys or fall back to environment variables
    const finnhubApiKey = bodyFinnhubKey || process.env.FINNHUB_API_KEY;
    const alphaVantageApiKey = bodyAlphaKey || process.env.ALPHA_VANTAGE_API_KEY;

    // Validate required fields
    if (!symbol || !finnhubApiKey) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: symbol is required, and finnhubApiKey must be provided in request body or FINNHUB_API_KEY environment variable',
        receivedFields: {
          symbol: symbol ? 'provided' : 'missing',
          finnhubApiKey: bodyFinnhubKey ? 'provided in body' : (process.env.FINNHUB_API_KEY ? 'using environment variable' : 'missing')
        }
      });
    }

    // Validate market if provided
    if (market && !['US', 'HK'].includes(market)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid market. Must be "US" or "HK"',
        received: market
      });
    }

    // Validate marketGrowthRatePercent if provided
    if (marketGrowthRatePercent !== undefined) {
      const rate = parseFloat(marketGrowthRatePercent);
      if (!Number.isFinite(rate) || rate <= 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'marketGrowthRatePercent must be a positive number',
          received: marketGrowthRatePercent
        });
      }
    }

    // Calculate valuation
    const result = await calculateStockValuation({
      symbol: symbol.toUpperCase(),
      finnhubApiKey,
      alphaVantageApiKey,
      market: market || 'US',
      marketGrowthRatePercent: marketGrowthRatePercent || 10
    });

    res.json(result);

  } catch (error) {
    console.error('Valuation error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Batch valuation endpoint
 * GET /api/valuation/batch
 * 
 * Query parameters:
 * - symbols (required): Comma-separated list of stock symbols (e.g., "AAPL,MSFT,GOOGL")
 * - markets (optional): Comma-separated list of markets corresponding to symbols (default: US for all)
 * - finnhubApiKey (optional): Finnhub API key (or use FINNHUB_API_KEY env var)
 * - alphaVantageApiKey (optional): Alpha Vantage API key (or use ALPHA_VANTAGE_API_KEY env var)
 * - marketGrowthRatePercent (optional): Market growth rate for all (default: 10)
 */
app.get('/api/valuation/batch', async (req, res) => {
  try {
    const { symbols, markets, finnhubApiKey: bodyFinnhubKey, alphaVantageApiKey: bodyAlphaKey, marketGrowthRatePercent } = req.query;

    // Use provided keys or fall back to environment variables
    const finnhubApiKey = bodyFinnhubKey || process.env.FINNHUB_API_KEY;
    const alphaVantageApiKey = bodyAlphaKey || process.env.ALPHA_VANTAGE_API_KEY;

    if (!finnhubApiKey || !symbols) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required fields: symbols query parameter is required, and finnhubApiKey must be provided in query or FINNHUB_API_KEY environment variable'
      });
    }

    // Parse comma-separated symbols
    const symbolList = symbols.split(',').map(s => s.trim()).filter(s => s);
    
    if (symbolList.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'symbols cannot be empty'
      });
    }

    // Parse comma-separated markets (if provided)
    const marketList = markets ? markets.split(',').map(m => m.trim()) : symbolList.map(() => 'US');

    // Process all valuations in parallel
    const results = await Promise.all(
      symbolList.map((symbol, index) =>
        calculateStockValuation({
          symbol: symbol.toUpperCase(),
          finnhubApiKey,
          alphaVantageApiKey,
          market: marketList[index] || 'US',
          marketGrowthRatePercent: parseFloat(marketGrowthRatePercent) || 10
        }).catch(error => ({
          symbol,
          error: error.message,
          valuationPossible: false
        }))
      )
    );

    res.json({
      processingTime: new Date().toISOString(),
      count: results.length,
      results
    });

  } catch (error) {
    console.error('Batch valuation error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: [
      'GET /health',
      'GET /api/docs',
      'POST /api/valuation',
      'POST /api/valuation/batch'
    ]
  });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PEG Stock Valuation Microservice running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});
