// Strukturirano logovanje (P1-12): pino JSON logovi + pino-http sa request ID.
// U dev okruženju čitljiviji nivo; u produkciji JSON za Railway log agregaciju.

import pino from 'pino'
import pinoHttp from 'pino-http'
import { randomUUID } from 'node:crypto'

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: undefined, // bez pid/hostname šuma — Railway to već zna
})

export const httpLogger = pinoHttp({
  logger,
  genReqId: req => req.headers['x-request-id'] || randomUUID(),
  // Health check i statika bi zatrpali log — loguj samo /api
  autoLogging: {
    ignore: req => !req.url.startsWith('/api'),
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  // Ne loguj Authorization header
  serializers: {
    req: req => ({ id: req.id, method: req.method, url: req.url }),
    res: res => ({ statusCode: res.statusCode }),
  },
})
