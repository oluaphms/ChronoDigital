# Design: Diagnóstico e Otimização de Performance do ChronoDigital

## Overview

This design document outlines the technical architecture and implementation strategy for comprehensive performance optimization of the ChronoDigital system. The optimization initiative addresses critical performance bottlenecks across the entire stack: database queries, backend APIs, frontend rendering, and network latency.

### Design Goals

1. **Reduce Frontend Load Time**: From 4-5s to <2s (FCP)
2. **Reduce API Latency**: From 800-1200ms to <500ms (P95)
3. **Reduce Database Query Time**: From 500-800ms to <200ms (P95)
4. **Reduce JavaScript Bundle**: From ~800KB to <400KB
5. **Achieve 99.5% System Availability**: With <0.5% error rate
6. **Enable Real-time Monitoring**: With automated alerting for anomalies

### Key Principles

- **Incremental Implementation**: Each optimization validated before proceeding
- **Zero Data Loss**: All changes maintain data integrity
- **Backward Compatibility**: No breaking changes to existing APIs
- **Observability First**: Comprehensive monitoring at every layer
- **Documentation-Driven**: Every optimization documented with rationale

---

## Architecture

### Current State Analysis

```
┌─────────────────────────────────────────────────────────────────┐
│                         ChronoDigital Stack                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Frontend (React/Next.js)                                        │
│  ├─ Bundle: ~800KB (uncompressed)                               │
│  ├─ No code splitting                                            │
│  ├─ No lazy loading                                              │
│  └─ No pagination on lists                                       │
│                                                                   │
│  Backend (Vercel Serverless)                                     │
│  ├─ No response compression                                      │
│  ├─ No retry logic                                               │
│  ├─ No batch processing                                          │
│  └─ No rate limiting                                             │
│                                                                   │
│  Database (Supabase/PostgreSQL)                                  │
│  ├─ Missing indexes                                              │
│  ├─ N+1 queries in timesheet endpoint                           │
│  ├─ No materialized views                                        │
│  └─ No query optimization                                        │
│                                                                   │
│  Monitoring                                                       │
│  └─ None (no observability)                                      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Target State Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Optimized ChronoDigital Stack                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Frontend (React/Next.js) - Optimized                            │
│  ├─ Bundle: <400KB (with code splitting)                        │
│  ├─ Route-based code splitting                                   │
│  ├─ Component lazy loading                                       │
│  ├─ Virtual scrolling for lists                                  │
│  ├─ Image optimization & lazy loading                            │
│  └─ Prefetching for navigation                                   │
│                                                                   │
│  CDN Layer (Vercel Edge)                                         │
│  ├─ Static asset caching                                         │
│  ├─ HTTP/2 multiplexing                                          │
│  └─ Gzip compression                                             │
│                                                                   │
│  Backend (Vercel Serverless) - Optimized                         │
│  ├─ Response compression (gzip)                                  │
│  ├─ Retry logic with exponential backoff                         │
│  ├─ Batch processing for bulk operations                         │
│  ├─ Rate limiting & throttling                                   │
│  └─ Request/response caching headers                             │
│                                                                   │
│  Cache Layer (Redis)                                             │
│  ├─ User data cache (TTL: 5min)                                  │
│  ├─ Configuration cache (TTL: 1hr)                               │
│  ├─ Timesheet cache (TTL: 30min)                                 │
│  └─ Cache invalidation on mutations                              │
│                                                                   │
│  Database (Supabase/PostgreSQL) - Optimized                      │
│  ├─ Strategic indexes on hot queries                             │
│  ├─ Composite indexes for common filters                         │
│  ├─ Materialized views for aggregations                          │
│  ├─ Query optimization with JOINs                                │
│  └─ Connection pooling                                           │
│                                                                   │
│  Monitoring & Observability                                      │
│  ├─ Real-time metrics collection                                 │
│  ├─ Performance dashboards                                       │
│  ├─ Automated alerting                                           │
│  └─ Historical trend analysis                                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components and Interfaces

### 1. Database Optimization Layer

#### 1.1 Index Strategy

**Critical Indexes to Create:**

```sql
-- Punches table indexes
CREATE INDEX idx_punches_employee_created 
  ON punches(employee_id, created_at DESC);

CREATE INDEX idx_punches_created_range 
  ON punches(created_at DESC) 
  WHERE deleted_at IS NULL;

CREATE INDEX idx_punches_location 
  ON punches(latitude, longitude) 
  USING GIST;

-- Employees table indexes
CREATE INDEX idx_employees_company 
  ON employees(company_id, active);

CREATE INDEX idx_employees_email 
  ON employees(email) 
  WHERE deleted_at IS NULL;

-- Timesheets table indexes
CREATE INDEX idx_timesheets_employee_period 
  ON timesheets(employee_id, period_start, period_end);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_created 
  ON audit_logs(created_at DESC);

CREATE INDEX idx_audit_logs_user_action 
  ON audit_logs(user_id, action, created_at DESC);
```

**Rationale:**
- Composite indexes on (employee_id, created_at) eliminate N+1 queries in timesheet endpoint
- Partial indexes on deleted_at reduce index size and improve query planning
- GIST indexes on geolocation enable efficient spatial queries
- Descending order on timestamps optimizes range queries

#### 1.2 Query Optimization Patterns

**Pattern 1: Replace N+1 with JOIN**

Before (N+1 problem):
```sql
-- Query 1: Get timesheet
SELECT * FROM timesheets WHERE employee_id = $1 AND period = $2;

-- Query 2-31: For each day, get punches (30 queries!)
SELECT * FROM punches WHERE employee_id = $1 AND DATE(created_at) = $2;
```

After (Optimized with JOIN):
```sql
SELECT 
  t.id, t.employee_id, t.period_start, t.period_end,
  COUNT(p.id) as punch_count,
  MIN(p.created_at) as first_punch,
  MAX(p.created_at) as last_punch,
  ARRAY_AGG(json_build_object(
    'id', p.id,
    'type', p.type,
    'created_at', p.created_at,
    'latitude', p.latitude,
    'longitude', p.longitude
  )) as punches
FROM timesheets t
LEFT JOIN punches p ON p.employee_id = t.employee_id 
  AND p.created_at >= t.period_start 
  AND p.created_at < t.period_end + INTERVAL '1 day'
WHERE t.employee_id = $1 AND t.period_start = $2
GROUP BY t.id, t.employee_id, t.period_start, t.period_end;
```

**Pattern 2: Use Materialized Views for Aggregations**

```sql
-- Materialized view for daily punch summaries
CREATE MATERIALIZED VIEW mv_daily_punch_summary AS
SELECT 
  employee_id,
  DATE(created_at) as punch_date,
  COUNT(*) as punch_count,
  MIN(created_at) as first_punch,
  MAX(created_at) as last_punch,
  COUNT(CASE WHEN type = 'IN' THEN 1 END) as in_count,
  COUNT(CASE WHEN type = 'OUT' THEN 1 END) as out_count
FROM punches
WHERE deleted_at IS NULL
GROUP BY employee_id, DATE(created_at);

-- Index on materialized view
CREATE INDEX idx_mv_daily_punch_employee_date 
  ON mv_daily_punch_summary(employee_id, punch_date DESC);

-- Refresh strategy: Incremental refresh every 5 minutes
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_punch_summary;
```

**Pattern 3: Pagination with Cursor-Based Approach**

```sql
-- Instead of OFFSET (which scans all rows)
-- Use cursor-based pagination with index
SELECT * FROM punches 
WHERE employee_id = $1 
  AND created_at < $2  -- cursor (last timestamp from previous page)
ORDER BY created_at DESC
LIMIT 50;
```

#### 1.3 Connection Pooling

Configure Supabase connection pooling:
- **Pool Mode**: Transaction mode (recommended for serverless)
- **Pool Size**: 10-20 connections
- **Idle Timeout**: 30 seconds
- **Max Client Connections**: 100

### 2. Cache Layer Architecture

#### 2.1 Redis Cache Strategy

**Cache Tiers:**

```
Tier 1: HTTP Cache (Browser/CDN)
├─ Static assets: 1 year
├─ API responses: 5-60 minutes
└─ Validation: ETag, Last-Modified

Tier 2: Application Cache (Redis)
├─ User data: 5 minutes
├─ Configuration: 1 hour
├─ Timesheet: 30 minutes
└─ Aggregations: 15 minutes

Tier 3: Database
└─ Source of truth
```

**Cache Key Naming Convention:**

```
user:{userId}                          # User profile
user:{userId}:permissions              # User permissions
config:{configKey}                     # Configuration
timesheet:{employeeId}:{period}        # Timesheet data
punch:list:{employeeId}:{date}         # Daily punches
aggregation:daily:{date}               # Daily aggregations
```

**Cache Invalidation Strategy:**

```javascript
// On user update
await redis.del(`user:${userId}`);
await redis.del(`user:${userId}:permissions`);

// On punch creation
await redis.del(`punch:list:${employeeId}:${date}`);
await redis.del(`timesheet:${employeeId}:${period}`);
await redis.del(`aggregation:daily:${date}`);

// On configuration change
await redis.del(`config:*`);  // Invalidate all config
```

#### 2.2 HTTP Cache Headers

**API Response Headers:**

```
// User data (5 minutes)
Cache-Control: private, max-age=300
ETag: "abc123"
Last-Modified: Wed, 21 Oct 2024 07:28:00 GMT

// Configuration (1 hour)
Cache-Control: private, max-age=3600
ETag: "def456"

// Static assets (1 year)
Cache-Control: public, max-age=31536000, immutable
ETag: "ghi789"
```

### 3. Backend API Optimization

#### 3.1 Response Compression

**Vercel Configuration (vercel.json):**

```json
{
  "headers": [
    {
      "source": "/api/:path*",
      "headers": [
        {
          "key": "Content-Encoding",
          "value": "gzip"
        },
        {
          "key": "Vary",
          "value": "Accept-Encoding"
        }
      ]
    }
  ]
}
```

**Expected Compression Ratios:**
- JSON responses: 70-80% reduction
- HTML: 60-70% reduction
- JavaScript: 65-75% reduction

#### 3.2 Retry Logic with Exponential Backoff

**Implementation Pattern:**

```typescript
async function apiCallWithRetry(
  fn: () => Promise<any>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      // Exponential backoff: 100ms, 200ms, 400ms
      const delay = baseDelay * Math.pow(2, attempt);
      // Add jitter: ±10%
      const jitter = delay * 0.1 * (Math.random() - 0.5);
      await new Promise(resolve => 
        setTimeout(resolve, delay + jitter)
      );
    }
  }
}
```

**Retry Strategy:**
- Retryable errors: 408, 429, 500, 502, 503, 504
- Non-retryable: 400, 401, 403, 404
- Max retries: 3
- Backoff: Exponential with jitter

#### 3.3 Batch Processing

**Batch API Endpoint:**

```typescript
// POST /api/batch
// Request body:
{
  "requests": [
    { "method": "GET", "path": "/api/punches/123" },
    { "method": "GET", "path": "/api/timesheet/456" },
    { "method": "POST", "path": "/api/punch", "body": {...} }
  ]
}

// Response:
{
  "responses": [
    { "status": 200, "body": {...} },
    { "status": 200, "body": {...} },
    { "status": 201, "body": {...} }
  ]
}
```

**Benefits:**
- Reduces HTTP overhead
- Enables atomic operations
- Reduces round-trip latency

#### 3.4 Rate Limiting

**Implementation:**

```typescript
// Redis-based rate limiter
const rateLimiter = new RateLimiter({
  store: redis,
  keyPrefix: 'rate-limit:',
  points: 100,           // 100 requests
  duration: 60,          // per 60 seconds
  blockDuration: 60      // block for 60 seconds if exceeded
});

// Usage in API
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (error) {
    res.status(429).json({ error: 'Too many requests' });
  }
});
```

**Rate Limits by Endpoint:**
- Public endpoints: 100 req/min
- Authenticated endpoints: 500 req/min
- Admin endpoints: 1000 req/min

### 4. Frontend Optimization

#### 4.1 Code Splitting Strategy

**Route-Based Code Splitting:**

```typescript
// pages/timesheet.tsx
import dynamic from 'next/dynamic';

const TimesheetView = dynamic(
  () => import('../components/TimesheetView'),
  { loading: () => <LoadingSpinner /> }
);

export default function TimesheetPage() {
  return <TimesheetView />;
}
```

**Component-Based Code Splitting:**

```typescript
// For heavy components
const AnalyticsChart = dynamic(
  () => import('../components/AnalyticsChart'),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

const ReportGenerator = dynamic(
  () => import('../components/ReportGenerator'),
  { ssr: false }
);
```

**Expected Bundle Reduction:**
- Initial bundle: 800KB → 300KB (62% reduction)
- Per-route overhead: 50-100KB
- Lazy-loaded components: 20-50KB each

#### 4.2 Image Optimization

**Next.js Image Component:**

```typescript
import Image from 'next/image';

export function OptimizedImage({ src, alt }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={400}
      height={300}
      loading="lazy"
      quality={75}
      placeholder="blur"
      blurDataURL="data:image/..."
    />
  );
}
```

**Image Optimization Strategy:**
- Automatic format selection (WebP for modern browsers)
- Responsive image sizes
- Lazy loading by default
- Quality: 75 (good balance between quality and size)

#### 4.3 Virtual Scrolling for Lists

**Implementation with react-window:**

```typescript
import { FixedSizeList } from 'react-window';

export function PunchList({ punches }) {
  const Row = ({ index, style }) => (
    <div style={style} className="punch-row">
      {punches[index].type} - {punches[index].created_at}
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={punches.length}
      itemSize={50}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

**Benefits:**
- Renders only visible items (50-100 items instead of 1000+)
- Reduces DOM nodes from 1000+ to ~20
- Improves scroll performance significantly

#### 4.4 Prefetching Strategy

```typescript
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function PrefetchNextPage() {
  const router = useRouter();

  useEffect(() => {
    // Prefetch next page on hover
    router.prefetch('/timesheet');
    router.prefetch('/reports');
  }, [router]);

  return null;
}
```

---

## Data Models

### 1. Database Schema Changes

#### 1.1 New Indexes

```sql
-- Performance optimization indexes
CREATE INDEX idx_punches_employee_created 
  ON punches(employee_id, created_at DESC);

CREATE INDEX idx_punches_created_range 
  ON punches(created_at DESC) 
  WHERE deleted_at IS NULL;

CREATE INDEX idx_employees_company 
  ON employees(company_id, active);

CREATE INDEX idx_timesheets_employee_period 
  ON timesheets(employee_id, period_start, period_end);

CREATE INDEX idx_audit_logs_created 
  ON audit_logs(created_at DESC);
```

#### 1.2 Materialized Views

```sql
-- Daily punch summary for fast aggregations
CREATE MATERIALIZED VIEW mv_daily_punch_summary AS
SELECT 
  employee_id,
  DATE(created_at) as punch_date,
  COUNT(*) as punch_count,
  MIN(created_at) as first_punch,
  MAX(created_at) as last_punch,
  COUNT(CASE WHEN type = 'IN' THEN 1 END) as in_count,
  COUNT(CASE WHEN type = 'OUT' THEN 1 END) as out_count
FROM punches
WHERE deleted_at IS NULL
GROUP BY employee_id, DATE(created_at);

CREATE INDEX idx_mv_daily_punch_employee_date 
  ON mv_daily_punch_summary(employee_id, punch_date DESC);
```

#### 1.3 Performance Monitoring Table

```sql
-- Track performance metrics
CREATE TABLE performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  response_time_ms INTEGER NOT NULL,
  status_code INTEGER NOT NULL,
  error_message TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_user FOREIGN KEY (user_id) 
    REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_perf_metrics_endpoint_created 
  ON performance_metrics(endpoint, created_at DESC);

CREATE INDEX idx_perf_metrics_created 
  ON performance_metrics(created_at DESC);
```

### 2. Cache Data Models

**Redis Data Structures:**

```
String: user:{userId}
  Value: JSON serialized user object
  TTL: 300 seconds

String: config:{key}
  Value: JSON serialized config value
  TTL: 3600 seconds

Hash: timesheet:{employeeId}:{period}
  Fields: date -> punch_summary JSON
  TTL: 1800 seconds

Sorted Set: punch:list:{employeeId}:{date}
  Members: punch IDs
  Scores: timestamps
  TTL: 1800 seconds
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Before writing correctness properties, I need to analyze the acceptance criteria for testability using the prework tool.
