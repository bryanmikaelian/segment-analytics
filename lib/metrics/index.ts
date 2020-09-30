import debug, { Debugger } from 'debug'
import send from '@segment/send-json'

export interface MetricsOptions {
  host?: string;
  sampleRate?: number;
  flushTimer?: number;
  maxQueueSize?: number;
}

const DEFAULTS: MetricsOptions = {
  host: 'api.segment.io/v1',
  sampleRate: 0,
  flushTimer: 30 * 1000,
  maxQueueSize: 20
};

interface Metric {
  type: 'Counter'
  metric: string,
  value: number
  tags: Record<string, unknown>
}

class Metrics {
  public queue:  Metric[]
  public host: string
  public sampleRate: number
  public flushTimer: number
  public maxQueueSize: number
  public debug: Debugger


  constructor(options?: MetricsOptions) {
    options = {
      ...DEFAULTS,
      ...options ?? {}
    }

    this.host = options.host
    this.sampleRate = options.sampleRate
    this.flushTimer = options.flushTimer
    this.maxQueueSize = options.maxQueueSize;

    this.debug = debug('analytics.js:metrics');

    this.queue = []
  }

  options(options? :MetricsOptions): void {
    options = {
      ...DEFAULTS,
      ...options ?? {}
    }

    this.host = options.host
    this.sampleRate = options.sampleRate
    this.flushTimer = options.flushTimer
    this.maxQueueSize = options.maxQueueSize;

    if (this.sampleRate > 0) {
      setInterval(() =>{
        this.flush();
      }, this.flushTimer);
    }

  }

  increment(metric: string, tags?: Record<string, unknown>): void {
    if (Math.random() > this.sampleRate) {
      return;
    }

    if (this.queue.length >= this.maxQueueSize) {
      return;
    }

    this.queue.push({ type: 'Counter', metric: metric, value: 1, tags: tags });

    // Trigger a flush if this is an error metric.
    if (metric.indexOf('error') > 0) {
      this.flush();
    }
  }

  flush(): void {
    if (this.queue.length <= 0) {
      return;
    }

    const payload = { series: this.queue };
    const headers = { 'Content-Type': 'text/plain' };

    this.queue = [];

    // This endpoint does not support jsonp, so only proceed if the browser
    // supports xhr.
    if (send.type !== 'xhr') return;

    // TODO: Replace with `axios`
    send('https://' + this.host + '/m', payload, headers, (err, res) => {
      this.debug('sent %O, received %O', payload, [err, res]);
    });

  }
}

export default new Metrics()
export { Metrics }

