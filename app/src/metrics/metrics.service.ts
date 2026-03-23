import { Injectable, NestMiddleware, OnModuleInit } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { collectDefaultMetrics, Histogram, Counter, Gauge } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  public readonly httpRequestDuration: Histogram;
  public readonly httpRequestsTotal: Counter;
  public readonly httpActiveRequests: Gauge;

  constructor() {
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    this.httpActiveRequests = new Gauge({
      name: 'http_active_requests',
      help: 'Number of HTTP requests currently being processed',
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics();
  }
}

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/metrics') {
      return next();
    }

    // increment active requests at the start
    this.metricsService.httpActiveRequests.inc();

    const end = this.metricsService.httpRequestDuration.startTimer();

    res.on('finish', () => {
      const labels = {
        method: req.method,
        route: req.path,
        status_code: res.statusCode.toString(),
      };
      end(labels);
      this.metricsService.httpRequestsTotal.inc(labels);
      // decrement active requests when response is finished...
      this.metricsService.httpActiveRequests.dec();
    });

    // Handle cases where the connection is closed before finishing
    // we decrement thus to prevent the gauge from staying high
    res.on('close', () => {
      if (!res.writableEnded) {
        this.metricsService.httpActiveRequests.dec();
      }
    });

    next();
  }
}
