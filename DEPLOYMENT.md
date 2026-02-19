# Deployment Guide

Complete guide for deploying the PEG Stock Valuation Microservice in various environments.

## Table of Contents
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Production Checklist](#production-checklist)

## Local Development

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create .env file with your API keys
cp .env.example .env
# Edit .env and add your keys

# 3. Start server
npm run dev
# Server runs on http://localhost:3000
```

### Development Commands

```bash
# Start with auto-reload
npm run dev

# Start production-like environment
npm start

# Test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/docs
```

## Docker Deployment

### Create Dockerfile

Create a file named `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY app.js .
COPY lib/ ./lib/

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "app.js"]
```

### Build and Run Docker Image

```bash
# Build image
docker build -t peg-valuation:latest .

# Run container
docker run -d \
  -p 3000:3000 \
  -e FINNHUB_API_KEY=your_key \
  -e ALPHA_VANTAGE_API_KEY=your_key \
  --name peg-service \
  peg-valuation:latest

# Check logs
docker logs peg-service

# Stop container
docker stop peg-service
docker rm peg-service
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  peg-valuation:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - FINNHUB_API_KEY=${FINNHUB_API_KEY}
      - ALPHA_VANTAGE_API_KEY=${ALPHA_VANTAGE_API_KEY}
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
```

Run with Docker Compose:

```bash
# Copy .env with your keys
cp .env.example .env
# Edit .env with your API keys

# Start services
docker-compose up -d

# View logs
docker-compose logs -f peg-valuation

# Stop services
docker-compose down
```

## Cloud Deployment

### Heroku

```bash
# 1. Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# 2. Login and create app
heroku login
heroku create your-app-name

# 3. Set environment variables
heroku config:set FINNHUB_API_KEY=your_key
heroku config:set ALPHA_VANTAGE_API_KEY=your_key

# 4. Deploy
git push heroku main

# 5. View logs
heroku logs --tail

# 6. Open in browser
heroku open
```

### AWS Lambda (Serverless Framework)

Create `serverless.yml`:

```yaml
service: peg-valuation

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  environment:
    FINNHUB_API_KEY: ${env:FINNHUB_API_KEY}
    ALPHA_VANTAGE_API_KEY: ${env:ALPHA_VANTAGE_API_KEY}

functions:
  api:
    handler: handler.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
    timeout: 30

plugins:
  - serverless-offline
```

Deploy:

```bash
npm install -g serverless
serverless deploy
```

### Google Cloud Run

```bash
# 1. Set up gcloud CLI
# https://cloud.google.com/sdk/docs/install

# 2. Create Dockerfile (see above)

# 3. Build and push to Google Container Registry
gcloud builds submit --tag gcr.io/YOUR_PROJECT/peg-valuation

# 4. Deploy to Cloud Run
gcloud run deploy peg-valuation \
  --image gcr.io/YOUR_PROJECT/peg-valuation \
  --platform managed \
  --region us-central1 \
  --set-env-vars FINNHUB_API_KEY=your_key,ALPHA_VANTAGE_API_KEY=your_key \
  --allow-unauthenticated
```

### Azure App Service

```bash
# 1. Install Azure CLI
# https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

# 2. Login
az login

# 3. Create resource group
az group create --name myResourceGroup --location eastus

# 4. Create App Service plan
az appservice plan create \
  --name myAppServicePlan \
  --resource-group myResourceGroup \
  --sku B1 --is-linux

# 5. Create web app
az webapp create \
  --resource-group myResourceGroup \
  --plan myAppServicePlan \
  --name peg-valuation-api \
  --runtime "node|18.0" \
  --deployment-source-url https://github.com/YOUR_REPO.git \
  --deployment-source-branch main

# 6. Configure application settings
az webapp config appsettings set \
  --resource-group myResourceGroup \
  --name peg-valuation-api \
  --settings FINNHUB_API_KEY=your_key ALPHA_VANTAGE_API_KEY=your_key
```

## Production Checklist

### Security
- [ ] Use environment variables for all sensitive data
- [ ] Enable HTTPS/TLS
- [ ] Configure CORS appropriately (restrict origins if needed)
- [ ] Implement rate limiting
- [ ] Add request authentication/API keys if needed
- [ ] Set up security headers
- [ ] Regular security updates (npm audit)

### Reliability
- [ ] Configure health checks
- [ ] Set up monitoring/alerting
- [ ] Implement graceful shutdown
- [ ] Add request logging
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Configure auto-restart on failure
- [ ] Load testing and capacity planning

### Performance
- [ ] Enable caching (market PE daily, stock metrics hourly)
- [ ] Implement request throttling
- [ ] Monitor response times
- [ ] Database optimization if adding persistence
- [ ] CDN for static assets (if any)

### Operations
- [ ] Document API endpoints and usage
- [ ] Set up monitoring dashboard
- [ ] Create runbooks for common issues
- [ ] Backup API keys securely
- [ ] Schedule regular dependency updates
- [ ] Set up automated testing/CI-CD pipeline

### Configuration Examples

#### Environment Variables for Production
```bash
# .env.production
NODE_ENV=production
PORT=3000
FINNHUB_API_KEY=your_key
ALPHA_VANTAGE_API_KEY=your_key
LOG_LEVEL=info
```

#### CORS for Production
Update `app.js`:
```javascript
const allowedOrigins = ['https://yourdomain.com'];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200
}));
```

#### Rate Limiting
Add to `app.js`:
```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.'
});

app.use('/api/', limiter);
```

## Monitoring & Logging

### Application Logging
```bash
npm install winston
```

Update `app.js` to use Winston for structured logging.

### Monitoring Services
- **Datadog**: https://www.datadoghq.com/
- **New Relic**: https://newrelic.com/
- **Sentry**: https://sentry.io/ (error tracking)
- **CloudWatch** (AWS): https://aws.amazon.com/cloudwatch/

### Health Check Integration
```bash
# Kubernetes health check
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Troubleshooting Production Issues

### High Response Times
1. Check API quota usage at Finnhub and Alpha Vantage
2. Monitor database connections (if added)
3. Enable caching for market PE
4. Consider batch endpoint for multiple valuations

### API Rate Limiting
- Implement exponential backoff
- Queue long-running requests
- Consider upgrading API plans

### Memory Leaks
- Monitor Node.js process memory
- Check for unclosed connections
- Review error handling

### Connection Issues to External APIs
- Add retry logic with circuit breaker pattern
- Monitor external API status pages
- Implement fallback strategies

## Support & Questions

See README.md for general guidance and API documentation.
