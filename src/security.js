import ipaddr from 'ipaddr.js';

export function createRateLimiter(limitPerMinute) {
  const buckets = new Map();

  return function check(ip) {
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    const key = `${ip}:${minute}`;
    const count = buckets.get(key) ?? 0;

    if (count >= limitPerMinute) {
      return false;
    }

    buckets.set(key, count + 1);
    if (buckets.size > 10_000) {
      for (const [bucketKey] of buckets) {
        const ts = Number.parseInt(bucketKey.split(':').pop() ?? '0', 10);
        if (Number.isFinite(ts) && ts < minute - 2) {
          buckets.delete(bucketKey);
        }
      }
    }
    return true;
  };
}

export class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.active < this.max) {
      this.active += 1;
      return;
    }

    await new Promise((resolve) => {
      this.queue.push(resolve);
    });
    this.active += 1;
  }

  release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

function getIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.ip;
}

export function requestIp(req) {
  return getIp(req);
}

export function isIpInSubnets(ip, subnets) {
  if (!ipaddr.isValid(ip)) {
    return false;
  }

  const parsed = ipaddr.parse(ip);
  return subnets.some((subnet) => {
    const [range, bits] = subnet.split('/');
    if (!range || !bits || !ipaddr.isValid(range)) {
      return false;
    }

    try {
      const network = ipaddr.parse(range);
      return parsed.kind() === network.kind() && parsed.match(network, Number.parseInt(bits, 10));
    } catch {
      return false;
    }
  });
}
