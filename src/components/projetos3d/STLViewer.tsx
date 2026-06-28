import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface STLAnalise { x: number; y: number; z: number; volume_cm3: number; triangulos: number }

interface Props {
  source: ArrayBuffer | string | null   // ArrayBuffer do STL, ou dataURL base64
  bed?: { x: number; y: number; z: number }
  height?: number
  onAnalyze?: (a: STLAnalise) => void
}

function dataURLtoArrayBuffer(dataUrl: string): ArrayBuffer {
  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr.buffer
}

function volumeDaGeometria(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position')
  if (!pos) return 0
  let vol = 0
  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i)
    const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1)
    const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2)
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return Math.abs(vol) / 1000 // mm³ → cm³
}

export default function STLViewer({ source, bed, height = 340, onAnalyze }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !source) return

    const w = mount.clientWidth || 400
    const h = height
    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08

    // Luzes
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.1))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(1, 1.5, 1)
    scene.add(dir)

    // Mesa de impressão (grid) — dimensionada pela impressora
    const bx = bed?.x || 220, by = bed?.y || 220
    const grid = new THREE.GridHelper(Math.max(bx, by), 22, 0x7c8499, 0x3a3f4b)
    ;(grid.material as THREE.Material).opacity = 0.35
    ;(grid.material as THREE.Material).transparent = true
    scene.add(grid)

    let frame = 0
    let mesh: THREE.Mesh | null = null

    try {
      const loader = new STLLoader()
      const buf = typeof source === 'string' ? dataURLtoArrayBuffer(source) : source
      const geo = loader.parse(buf)
      geo.computeVertexNormals()
      geo.computeBoundingBox()
      const bbox = geo.boundingBox!
      const size = new THREE.Vector3(); bbox.getSize(size)
      const center = new THREE.Vector3(); bbox.getCenter(center)

      const volume = volumeDaGeometria(geo)
      const triangulos = (geo.getAttribute('position')?.count || 0) / 3
      onAnalyze?.({ x: size.x, y: size.y, z: size.z, volume_cm3: volume, triangulos })

      const cabe = size.x <= bx && size.y <= by && size.z <= (bed?.z || 250)
      const cor = cabe ? 0x10b981 : 0xf59e0b
      const mat = new THREE.MeshStandardMaterial({ color: cor, metalness: 0.1, roughness: 0.65, flatShading: false })
      mesh = new THREE.Mesh(geo, mat)
      // Centraliza no plano XY e assenta na mesa (Z=0 vira base)
      mesh.position.set(-center.x, -center.y, -bbox.min.z)
      // STL usa Z como altura; three usa Y como "cima" → rotaciona pra deitar na grade
      const grupo = new THREE.Group()
      grupo.add(mesh)
      grupo.rotation.x = -Math.PI / 2
      scene.add(grupo)

      // Enquadra a câmera
      const maxDim = Math.max(size.x, size.y, size.z, 60)
      camera.position.set(maxDim * 1.1, maxDim * 1.0, maxDim * 1.3)
      controls.target.set(0, size.z / 2 * 0, 0)
      controls.update()
    } catch (e) {
      const aviso = document.createElement('div')
      aviso.style.cssText = 'color:#ef4444;font-size:13px;padding:16px;text-align:center'
      aviso.textContent = 'Não foi possível ler este STL.'
      mount.appendChild(aviso)
    }

    const animate = () => { frame = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera) }
    animate()

    const onResize = () => {
      const nw = mount.clientWidth || w
      camera.aspect = nw / h; camera.updateProjectionMatrix(); renderer.setSize(nw, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      if (mesh) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose() }
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [source, bed?.x, bed?.y, bed?.z, height, onAnalyze])

  return <div ref={mountRef} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(180deg,var(--bg-3),var(--bg-2))', cursor: 'grab' }} />
}
