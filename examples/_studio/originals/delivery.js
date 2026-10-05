import * as THREE from 'three'

// Local route-learning markers have no colliders and never alter race scoring.
const STOPS = 4

function numberLabel(number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff5df'
  ctx.beginPath()
  ctx.arc(64, 64, 58, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#51456a'
  ctx.font = 'bold 80px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(number), 64, 68)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }))
  label.position.y = 2.2
  label.scale.set(3, 3, 1)
  return label
}

export function createDelivery(scene, onVisit) {
  const group = new THREE.Group()
  group.visible = false
  scene.add(group)
  const geometry = new THREE.BoxGeometry(2, 2, 2)
  const material = new THREE.MeshStandardMaterial({ color: '#bca3df', roughness: 0.5 })
  const ribbonMaterial = new THREE.MeshStandardMaterial({ color: '#ffe1a2' })
  const markers = Array.from({ length: STOPS }, (_, i) => {
    const marker = new THREE.Group()
    marker.add(new THREE.Mesh(geometry, material))
    const ribbon = new THREE.Mesh(geometry, ribbonMaterial)
    ribbon.scale.set(0.2, 1.03, 1.03)
    marker.add(ribbon)
    marker.add(numberLabel(i + 1))
    group.add(marker)
    return marker
  })

  let next = 0
  let points = []
  return {
    get points() { return points },
    get next() { return next },
    // Spread the stops evenly along the lap, between the start and the finish.
    configure(track) {
      next = 0
      points = markers.map((marker, i) => {
        const point = track.curve.getPointAt((i + 1) / (STOPS + 1))
        marker.position.copy(point)
        marker.position.y = 3
        marker.visible = true
        return point
      })
    },
    show(value) { group.visible = value },
    // Stops only count in order: the car must reach the next numbered marker.
    update(position, radius) {
      const point = points[next]
      if (!point || Math.hypot(position.x - point.x, position.z - point.z) > radius) return
      markers[next].visible = false
      onVisit(next++)
    },
  }
}
