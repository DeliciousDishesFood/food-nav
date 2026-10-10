/**
 * task-25 · 3D 樱花装饰层：立体交叉花瓣 + 粉月亮 + 低多边形樱花树（three.js 懒加载，升级自 task-24）
 *
 *  - three 只在 useEffect 里 `await import('three')`（严禁顶部静态 import）→ vite 拆独立 chunk，不进首屏
 *  - 无 WebGL / prefers-reduced-motion → return null（jsdom 同路径，verify 里安全静默、不报错）
 *  - `import('three')` 与 WebGLRenderer 创建都 try/catch，失败静默降级（背景失败绝不影响页面）
 *  - 容器 fixed inset-0 z-0 pointer-events:none：视觉压在卡片/导航/星星下层，不挡任何交互
 *  - 桌面 40 片 / 移动端 15 片：y 下落 + x 正弦风场 + 缓慢翻转，落到 y<-5 回收重生
 *  - 【task-25】花瓣 = 两片 plane 90° 交叉的单个 geometry（侧转不再露馅成一条线）
 *  - 【task-25】右上粉月亮：球体贴 Canvas 径向渐变（中心 #fff8fa → 边缘 #ffb6cd）+ 外圈 BackSide 半透明 glow
 *  - 【task-25】右下低多边形樱花树：CylinderGeometry 树干 + 4 个 IcosahedronGeometry 圆润树冠（flat shading）
 *  - 【task-25】花瓣 recycle 起点偏向树的 x（视觉上从树上飘落）
 *  - 【task-25】视差分层：花瓣靠相机（±0.3），月亮 0.5×、树 0.3× → 月亮/树动得更慢更远
 *  - visibilitychange 切后台暂停、resize 同步相机与画布、卸载 dispose 全部 GPU 资源
 *  - 验收钩子 host.__sakura3d = { camera, renderer, count, scene, petals, moon, tree }（只读，供 CDP 取证）
 */
import { useEffect, useRef, useState } from 'react'

/** 花瓣配色（粉白系半透明，暗色模式下 opacity 0.65 仍可见） */
const PETAL_COLORS = [0xffb6cd, 0xffc9dc, 0xffe2ec, 0xffa9c6]

/** 桌面 / 移动端（<768px）花瓣数量 */
const DESKTOP_COUNT = 40
const MOBILE_COUNT = 15
/** 单片花瓣尺寸（两片交叉 plane 的边长，随机） */
const PETAL_MIN = 0.12
const PETAL_MAX = 0.2
/** 下落速度区间（视口单位 / 秒） */
const FALL_MIN = 0.3
const FALL_MAX = 0.8
/** 半透明度（氛围色，不抢卡片视觉） */
const PETAL_OPACITY = 0.65
/** 相机与场景参数 */
const CAMERA_Z = 8
const FOV = 50
const Z_RANGE = 2
/** 风场摆动幅度 / 频率区间 */
const SWING_MIN = 0.12
const SWING_MAX = 0.45
const SWING_SPEED_MIN = 0.4
const SWING_SPEED_MAX = 1.1
/** 回收线（视口下方）与重生高度（视口上方） */
const RECYCLE_Y = -5
const SPAWN_Y_MIN = 3
const SPAWN_Y_MAX = 8
/** 鼠标视差系数：×0.6 → 相机偏移范围 ±0.3 */
const PARALLAX = 0.6
/** 月亮（右上远景）规格与位置 */
const MOON_BASE = { x: 3.5, y: 3, z: -3 }
const MOON_RADIUS = 0.8
const MOON_GLOW_RADIUS = 1.18
const MOON_GLOW_OPACITY = 0.15
/** 樱花树（右下远景）位置 */
const TREE_BASE = { x: 3, y: -3.5, z: -2 }
/** 装饰层视差：比花瓣慢（月亮 0.5×、树 0.3× 相机偏移量） */
const MOON_PARALLAX = 0.5
const TREE_PARALLAX = 0.3
/** recycle 时花瓣 x 偏向树的随机半径（随视口收窄） */
const RECYCLE_SPREAD = 3
/** 移动端装饰层：位置收缩 + 尺寸缩小（不挤内容） */
const COMPACT_MQ = '(max-width: 767px)'
const DECOR_POS_SCALE_COMPACT = 0.5
const DECOR_SIZE_SCALE_COMPACT = 0.7
/** 树冠：4 团低多边形球（下深上浅的粉白渐变 #ffd9e6 → #fff0f5） */
const CROWN_BLOBS = [
  { r: 0.62, p: [0, 1.16, 0], color: 0xffd9e6 },
  { r: 0.45, p: [-0.44, 0.96, 0.06], color: 0xffe2ec },
  { r: 0.45, p: [0.44, 1.0, -0.06], color: 0xffe6f0 },
  { r: 0.38, p: [0.04, 1.56, 0.03], color: 0xfff0f5 },
]

const rand = (min, max) => min + Math.random() * (max - min)

/** 运行环境探测：无 WebGL 或用户开启 reduced-motion → 整个组件不渲染（jsdom 天然 false） */
function detectRuntime() {
  try {
    if (typeof window === 'undefined' || !window.WebGLRenderingContext) return false
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return false
    }
    const probe = document.createElement('canvas')
    const gl =
      probe.getContext('webgl2') || probe.getContext('webgl') || probe.getContext('experimental-webgl')
    if (!gl) return false
    const lose = gl.getExtension('WEBGL_lose_context')
    if (lose) lose.loseContext()
    return true
  } catch {
    return false
  }
}

/** 单瓣贴图（白瓣 + 顶端樱花小缺口），任何一步失败都回退纯色平面 */
function makePetalTexture(THREE) {
  try {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(32, 60)
    ctx.bezierCurveTo(6, 46, 8, 20, 32, 10)
    ctx.bezierCurveTo(56, 20, 58, 46, 32, 60)
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(32, 8, 7, 0, Math.PI * 2)
    ctx.fill()
    const texture = new THREE.CanvasTexture(canvas)
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace
    return texture
  } catch {
    return null
  }
}

/** 月亮贴图：球面 UV 正对相机处是 u=0.25，径向渐变中心画在那里（中心偏白、边缘樱花粉），双心绘制消除 u=0/1 接缝 */
function makeMoonTexture(THREE) {
  try {
    const w = 256
    const h = 128
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const cx = w * 0.25
    const cy = h * 0.5
    const radius = w * 0.28
    ctx.fillStyle = '#ff9ec2'
    ctx.fillRect(0, 0, w, h)
    for (const center of [cx, cx + w]) {
      const gradient = ctx.createRadialGradient(center, cy, 2, center, cy, radius)
      gradient.addColorStop(0, '#fffdfb')
      gradient.addColorStop(0.4, '#ffe9f1')
      gradient.addColorStop(0.72, '#ffc2d6')
      gradient.addColorStop(1, '#ff9ec2')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, w, h)
    }
    const texture = new THREE.CanvasTexture(canvas)
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace
    return texture
  } catch {
    return null
  }
}

/** 立体花瓣：两片 PlaneGeometry 90° 交叉（XY 面 + ZY 面）合成**一个** geometry → 单次 draw、侧转有厚度 */
function makeCrossGeometry(THREE, width, height) {
  const planeA = new THREE.PlaneGeometry(width, height)
  const planeB = new THREE.PlaneGeometry(width, height)
  planeB.rotateY(Math.PI / 2)
  const sources = [planeA, planeB]
  let vertexTotal = 0
  let indexTotal = 0
  for (const source of sources) {
    vertexTotal += source.attributes.position.count
    indexTotal += source.index.count
  }
  const position = new Float32Array(vertexTotal * 3)
  const normal = new Float32Array(vertexTotal * 3)
  const uv = new Float32Array(vertexTotal * 2)
  const index = new Uint16Array(indexTotal)
  let vertexOffset = 0
  let indexOffset = 0
  for (const source of sources) {
    position.set(source.attributes.position.array, vertexOffset * 3)
    normal.set(source.attributes.normal.array, vertexOffset * 3)
    uv.set(source.attributes.uv.array, vertexOffset * 2)
    const sourceIndex = source.index.array
    for (let i = 0; i < sourceIndex.length; i += 1) index[indexOffset + i] = sourceIndex[i] + vertexOffset
    vertexOffset += source.attributes.position.count
    indexOffset += sourceIndex.length
    source.dispose()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  return geometry
}

/** 粉月亮：球体贴径向渐变 + 外圈 BackSide 半透明 glow（外侧成环、不糊住球面） */
function buildMoon(THREE, store) {
  const group = new THREE.Group()
  const moonTexture = makeMoonTexture(THREE)
  if (moonTexture) store.textures.push(moonTexture)
  const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 32, 32)
  const moonMaterial = new THREE.MeshBasicMaterial(
    moonTexture ? { map: moonTexture } : { color: 0xfff0f5 },
  )
  store.geometries.push(moonGeometry)
  store.materials.push(moonMaterial)
  group.add(new THREE.Mesh(moonGeometry, moonMaterial))

  const glowGeometry = new THREE.SphereGeometry(MOON_GLOW_RADIUS, 32, 32)
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc9dc,
    transparent: true,
    opacity: MOON_GLOW_OPACITY,
    side: THREE.BackSide,
    depthWrite: false,
  })
  store.geometries.push(glowGeometry)
  store.materials.push(glowMaterial)
  group.add(new THREE.Mesh(glowGeometry, glowMaterial))
  return group
}

/** 低多边形樱花树：细棕树干 + 4 团棱面树冠（Icosahedron 非索引面法线自带 flat 观感，粉白渐变，远景剪影） */
function buildTree(THREE, store) {
  const group = new THREE.Group()
  const trunkGeometry = new THREE.CylinderGeometry(0.055, 0.1, 0.95, 6)
  const trunkMaterial = new THREE.MeshBasicMaterial({ color: 0xa9805e })
  store.geometries.push(trunkGeometry)
  store.materials.push(trunkMaterial)
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
  trunk.position.y = 0.475
  group.add(trunk)

  for (const blob of CROWN_BLOBS) {
    const geometry = new THREE.IcosahedronGeometry(blob.r, 0)
    const material = new THREE.MeshBasicMaterial({ color: blob.color })
    store.geometries.push(geometry)
    store.materials.push(material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(blob.p[0], blob.p[1], blob.p[2])
    mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI))
    group.add(mesh)
  }
  return group
}

/** 创建场景并启动动画，返回 dispose（内部异常先自我清理再抛出，由调用方静默吞掉） */
function startScene(THREE, host) {
  let renderer = null
  let canvas = null
  let raf = 0
  let running = false
  let time = 0
  let halfWidth = 4
  let targetX = 0
  let targetY = 0
  let decorPosScale = 1
  let moonBase = { x: MOON_BASE.x, y: MOON_BASE.y, z: MOON_BASE.z }
  let treeBase = { x: TREE_BASE.x, y: TREE_BASE.y, z: TREE_BASE.z }
  const geometries = []
  const materials = []
  const textures = []
  const petals = []
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60)
  const clock = new THREE.Clock()
  camera.position.set(0, 0, CAMERA_Z)

  const store = { geometries, materials, textures }
  const moonGroup = buildMoon(THREE, store)
  const treeGroup = buildTree(THREE, store)
  scene.add(moonGroup, treeGroup)

  /** recycle 起点：偏向树的 x（从树上飘下来的视觉），并按视口收窄夹紧 */
  function recycleX() {
    const spread = Math.min(RECYCLE_SPREAD, halfWidth * 0.6)
    const x = treeBase.x + rand(-spread, spread)
    return Math.max(-halfWidth, Math.min(halfWidth, x))
  }

  /** 重生一片花瓣：initial=true 时纵贯视口铺开（首帧就有花），否则从树附近飘下 */
  function spawn(petal, initial) {
    const { mesh } = petal
    petal.baseX = initial ? rand(-halfWidth, halfWidth) : recycleX()
    petal.phase = rand(0, Math.PI * 2)
    petal.swing = rand(SWING_MIN, SWING_MAX)
    petal.swingSpeed = rand(SWING_SPEED_MIN, SWING_SPEED_MAX)
    petal.fall = rand(FALL_MIN, FALL_MAX)
    petal.rotX = rand(-0.6, 0.6)
    petal.rotZ = rand(-0.8, 0.8)
    mesh.position.set(
      petal.baseX,
      initial ? rand(RECYCLE_Y, SPAWN_Y_MAX) : rand(SPAWN_Y_MIN, SPAWN_Y_MAX),
      rand(-Z_RANGE, Z_RANGE),
    )
    mesh.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI))
  }

  /** 装饰层布局：移动端（<768）位置收缩到 0.5、尺寸缩到 0.7，避免挤占视野 */
  function applyDecorLayout() {
    const compact =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia(COMPACT_MQ).matches
    decorPosScale = compact ? DECOR_POS_SCALE_COMPACT : 1
    const sizeScale = compact ? DECOR_SIZE_SCALE_COMPACT : 1
    moonGroup.scale.setScalar(sizeScale)
    treeGroup.scale.setScalar(sizeScale)
    moonBase = { x: MOON_BASE.x * decorPosScale, y: MOON_BASE.y * decorPosScale, z: MOON_BASE.z }
    treeBase = { x: TREE_BASE.x * decorPosScale, y: TREE_BASE.y * decorPosScale, z: TREE_BASE.z }
    moonGroup.position.set(moonBase.x, moonBase.y, moonBase.z)
    treeGroup.position.set(treeBase.x, treeBase.y, treeBase.z)
  }

  /** 同步相机/画布尺寸，顺便按新宽高比算出花瓣横向铺开范围 */
  function resize() {
    const width = host.clientWidth || window.innerWidth || 1
    const height = host.clientHeight || window.innerHeight || 1
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    if (renderer) renderer.setSize(width, height, false)
    const halfHeight = Math.tan((FOV * Math.PI) / 360) * (CAMERA_Z + Z_RANGE)
    halfWidth = halfHeight * camera.aspect + 0.5
    applyDecorLayout()
  }

  function tick() {
    raf = window.requestAnimationFrame(tick)
    const delta = Math.min(clock.getDelta(), 0.05)
    time += delta
    renderer.info.reset()
    camera.position.x += (targetX - camera.position.x) * Math.min(1, delta * 5)
    camera.position.y += (targetY - camera.position.y) * Math.min(1, delta * 5)
    // 装饰层视差：与相机同向的更小偏移 → 屏幕上比花瓣慢（月亮 0.5×、树 0.3×）
    moonGroup.position.x = moonBase.x + targetX * MOON_PARALLAX
    moonGroup.position.y = moonBase.y + targetY * MOON_PARALLAX
    treeGroup.position.x = treeBase.x + targetX * TREE_PARALLAX
    treeGroup.position.y = treeBase.y + targetY * TREE_PARALLAX
    for (let i = 0; i < petals.length; i += 1) {
      const petal = petals[i]
      const { mesh } = petal
      mesh.position.y -= petal.fall * delta
      mesh.position.x = petal.baseX + Math.sin(time * petal.swingSpeed + petal.phase) * petal.swing
      mesh.rotation.x += petal.rotX * delta
      mesh.rotation.z += petal.rotZ * delta
      if (mesh.position.y < RECYCLE_Y) spawn(petal, false)
    }
    renderer.render(scene, camera)
  }

  function start() {
    if (running) return
    running = true
    clock.getDelta() // 丢掉暂停期间累计的时间，避免切回瞬间大跳
    raf = window.requestAnimationFrame(tick)
  }

  function stop() {
    running = false
    if (raf) {
      window.cancelAnimationFrame(raf)
      raf = 0
    }
  }

  function onMouseMove(event) {
    const x = event.clientX / (window.innerWidth || 1) - 0.5
    const y = event.clientY / (window.innerHeight || 1) - 0.5
    targetX = x * PARALLAX
    targetY = -y * PARALLAX
  }

  function onVisibilityChange() {
    if (document.hidden) stop()
    else start()
  }

  function onContextLost(event) {
    event.preventDefault()
    stop()
  }

  function onContextRestored() {
    resize()
    start()
  }

  function dispose() {
    stop()
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (canvas) {
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas)
    }
    geometries.forEach((geometry) => geometry.dispose())
    materials.forEach((material) => material.dispose())
    textures.forEach((texture) => texture.dispose())
    if (renderer) renderer.dispose()
    delete host.__sakura3d
  }

  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, 0)
    // 关 autoReset：帧末不抹零 → 验收脚本可读「上一帧实际绘制量」
    renderer.info.autoReset = false
    canvas = renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.pointerEvents = 'none'
    host.appendChild(canvas)

    const petalTexture = makePetalTexture(THREE)
    if (petalTexture) textures.push(petalTexture)
    resize()

    const count = window.matchMedia(COMPACT_MQ).matches ? MOBILE_COUNT : DESKTOP_COUNT

    for (let i = 0; i < count; i += 1) {
      const geometry = makeCrossGeometry(THREE, rand(PETAL_MIN, PETAL_MAX), rand(PETAL_MIN, PETAL_MAX))
      const material = new THREE.MeshBasicMaterial({
        color: PETAL_COLORS[i % PETAL_COLORS.length],
        map: petalTexture || null,
        transparent: true,
        opacity: PETAL_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      const petal = {
        mesh,
        baseX: 0,
        phase: 0,
        swing: 0,
        swingSpeed: 0,
        fall: 0,
        rotX: 0,
        rotZ: 0,
      }
      geometries.push(geometry)
      materials.push(material)
      petals.push(petal)
      scene.add(mesh)
      spawn(petal, true)
    }

    host.__sakura3d = { camera, renderer, count, scene, petals, moon: moonGroup, tree: treeGroup }
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibilityChange)
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)
    start()
  } catch (error) {
    dispose()
    throw error
  }

  return dispose
}

export default function Sakura3DBackground() {
  const hostRef = useRef(null)
  // 惰性探测：渲染期就判定（jsdom / 无 WebGL / reduced-motion → 恒为 false → return null）
  const [supported] = useState(detectRuntime)

  useEffect(() => {
    const host = hostRef.current
    if (!supported || !host) return undefined

    let disposed = false
    let teardown = () => {}

    ;(async () => {
      let THREE = null
      try {
        THREE = await import('three') // ← 懒加载关键：three 不进首屏 chunk
      } catch {
        return // 加载失败静默降级
      }
      if (disposed) return
      try {
        teardown = startScene(THREE, host)
      } catch {
        teardown = () => {} // WebGL 初始化失败静默降级
      }
    })()

    return () => {
      disposed = true
      teardown()
    }
  }, [supported])

  if (!supported) return null

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="sakura3d-layer pointer-events-none fixed inset-0 z-0 overflow-hidden"
    />
  )
}
