import * as THREE from 'three'
import { canvasTexture } from './util.js'

/**
 * Each place has its own visitor that wanders through now and then: a cow ambles across the
 * farmyard, tracking the paint it steps in as hoofprints; a big beach ball rolls across the toy room
 * leaving a rainbow stripe. (The town square's fountain sprays instead: see main.js.) The host
 * decides when and where, every device animates it, and the paint goes out as ordinary paint events.
 */
export const VISITORS = { farm: 'cow', toys: 'ball' }

const emojiSprite = (emoji, size) => {
  const tex = canvasTexture(256, 256, (g, w, h) => {
    g.font = '200px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(emoji, w / 2, h / 2 + 14)
  })
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
  sprite.scale.set(size, size, 1)
  return sprite
}

function beachBall() {
  const tex = canvasTexture(256, 128, (g, w, h) => {
    const cols = ['#eb5063', '#ffffff', '#f8d64e', '#ffffff', '#4e8ad5', '#ffffff']
    cols.forEach((c, i) => {
      g.fillStyle = c
      g.fillRect((i * w) / cols.length, 0, w / cols.length + 1, h)
    })
  })
  return new THREE.Mesh(new THREE.SphereGeometry(1.15, 28, 18), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35 }))
}

export class Visitor {
  /** A `visit` message: `k` cow | ball, walking from (x0, z0) to (x1, z1) over `dur` ms from `start` (performance time). */
  constructor(scene, { k: kind, x0, z0, x1, z1, dur }, start) {
    Object.assign(this, { kind, x0, z0, x1, z1, dur, start })
    this.group = new THREE.Group()
    this.yaw = Math.atan2(x1 - x0, z1 - z0)
    if (kind === 'cow') {
      this.body = emojiSprite('🐄', 3.4)
      // The emoji cow faces left: flip it when it walks right.
      if (x1 > x0) this.body.material.map.repeat.x = -1, this.body.material.map.offset.x = 1
      this.body.position.y = 1.5
    } else {
      this.body = beachBall()
      this.body.position.y = 1.15
    }
    this.group.add(this.body)
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false }))
    shadow.position.y = 0.03
    this.group.add(shadow)
    scene.add(this.group)
    this.x = x0
    this.z = z0
    this.done = false
  }

  /** Moves along its path; returns false once it has gone. */
  update(now) {
    const k = Math.min(1, Math.max(0, (now - this.start) / this.dur))
    const lx = this.x, lz = this.z
    this.x = this.x0 + (this.x1 - this.x0) * k
    this.z = this.z0 + (this.z1 - this.z0) * k
    this.group.position.set(this.x, 0, this.z)
    const moved = Math.hypot(this.x - lx, this.z - lz)
    if (this.kind === 'cow') {
      // An amble: a little bounce with each step.
      this.body.position.y = 1.5 + Math.abs(Math.sin(now / 160)) * 0.18
      this.body.material.rotation = Math.sin(now / 320) * 0.06
    } else {
      // Rolling: turn about the axis across its path.
      const axis = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
      this.body.rotateOnWorldAxis(axis, moved / 1.15)
    }
    if (k >= 1) this.done = true
    return !this.done
  }

  dispose() {
    this.group.removeFromParent()
    this.group.traverse((o) => {
      o.geometry?.dispose()
      o.material?.map?.dispose()
      o.material?.dispose()
    })
  }
}
