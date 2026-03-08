import * as THREE from 'three';
import type { Avatar } from './avatar.ts';
import { clamp } from '@/utils/lerp.ts';
import { eventBus } from '@/core/event-bus.ts';
import type { PatynaConfig } from '@/types/config.ts';

/**
 * Controls avatar gaze direction based on face tracking data.
 * Smoothly slerps head rotation toward the user's face position.
 */
export class AvatarController {
  private targetQuat = new THREE.Quaternion();
  private currentQuat = new THREE.Quaternion();
  private defaultQuat = new THREE.Quaternion();
  private smoothing: number;
  private maxYaw: number;
  private maxPitch: number;
  private hasFace = false;
  private returnToDefaultSpeed = 0.02;

  constructor(private avatar: Avatar, config: PatynaConfig) {
    this.smoothing = config.tracking.smoothingFactor;
    this.maxYaw = config.tracking.maxYaw;
    this.maxPitch = config.tracking.maxPitch;

    // Store default head rotation
    this.defaultQuat.copy(this.avatar.headGroup.quaternion);
    this.currentQuat.copy(this.defaultQuat);

    // Listen for face tracking events
    eventBus.on('face:position', (pos) => {
      this.hasFace = true;
      this.updateTarget(pos.x, pos.y);
    });

    eventBus.on('face:lost', () => {
      this.hasFace = false;
    });
  }

  private updateTarget(x: number, y: number): void {
    // x, y are normalized -1 to 1 from face tracker
    const yaw = clamp(x * this.maxYaw, -this.maxYaw, this.maxYaw);
    const pitch = clamp(-y * this.maxPitch, -this.maxPitch, this.maxPitch);

    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    this.targetQuat.setFromEuler(euler);
  }

  /** Call each frame from the render loop */
  update(_delta: number): void {
    if (this.hasFace) {
      // Slerp toward face target
      this.currentQuat.slerp(this.targetQuat, this.smoothing);
    } else {
      // Slowly return to default pose
      this.currentQuat.slerp(this.defaultQuat, this.returnToDefaultSpeed);
    }

    this.avatar.headGroup.quaternion.copy(this.currentQuat);
  }
}
