// task-18 · 本地可控检测目标 mock（配合 check/* 手动分级验收，端口 8899）
// 覆盖：403 反爬 / 500 降级 / 302 重定向 / HEAD-405 回退 GET / 404 消失 / 超时挂起
// 用法：node dev-docs/reports/task-18/mock-targets.mjs
import { createServer } from 'node:http'

const started = Date.now()
const server = createServer((req, res) => {
  const path = new URL(req.url || '/', 'http://127.0.0.1:8899').pathname
  if (path === '/hang') {
    // 60s 不回 → 检测超时（CHECK_TIMEOUT_MS 默认 5s）→ statusCode=0
    setTimeout(() => {
      if (!res.writableEnded) {
        res.statusCode = 200
        res.end('too late')
      }
    }, 60000)
    return
  }
  if (path === '/rate') {
    res.statusCode = 429
    res.end('too many requests')
    return
  }
  if (path === '/forbidden') {
    res.statusCode = 403
    res.end('forbidden')
    return
  }
  if (path === '/server-error') {
    res.statusCode = 500
    res.end('server error')
    return
  }
  if (path === '/redirect') {
    res.statusCode = 302
    res.setHeader('location', '/')
    res.end()
    return
  }
  if (path === '/nohead' && req.method === 'HEAD') {
    res.statusCode = 405
    res.end()
    return
  }
  if (path === '/missing') {
    res.statusCode = 404
    res.end('not found')
    return
  }
  res.statusCode = 200
  res.end(`ok ${Date.now() - started}ms`)
})

server.listen(8899, '127.0.0.1', () => {
  console.log('mock targets: http://127.0.0.1:8899/ (403/500/302/nohead/404/hang)')
})
