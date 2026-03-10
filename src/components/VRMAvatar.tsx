"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLoaderPlugin,
  VRM,
  VRMExpressionPresetName,
  VRMHumanBoneName,
} from "@pixiv/three-vrm";

interface VRMAvatarProps {
  isSpeaking: boolean;
}

const _euler = new THREE.Euler();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _qOut = new THREE.Quaternion();

type BonePose = Record<string, { rotation: [number, number, number, number] }>;

function eulerToQuat(x: number, y: number, z: number): [number, number, number, number] {
  _euler.set(x, y, z);
  _qOut.setFromEuler(_euler);
  return [_qOut.x, _qOut.y, _qOut.z, _qOut.w];
}

function blendQ(
  a: [number, number, number, number],
  b: [number, number, number, number],
  w: number
): [number, number, number, number] {
  _qA.set(a[0], a[1], a[2], a[3]);
  _qB.set(b[0], b[1], b[2], b[3]);
  _qOut.slerpQuaternions(_qA, _qB, w);
  return [_qOut.x, _qOut.y, _qOut.z, _qOut.w];
}

/**
 * Build a blended idle/speaking pose.
 * Confirmed working: X+Z compound rotation on arms, applied after vrm.update().
 * Axis conventions for this model (confirmed via diagnostic):
 *   - Z+: left arm UP, right arm UP (negative)
 *   - Z-: left arm DOWN
 *   - X+: forward tilt
 */
function buildPose(t: number, w: number): BonePose {
  const pose: BonePose = {};
  const b = (bone: string, idle: [number, number, number], speak: [number, number, number]) => {
    pose[bone] = { rotation: blendQ(eulerToQuat(...idle), eulerToQuat(...speak), w) };
  };

  // Head
  b(VRMHumanBoneName.Head,
    [Math.sin(t * 0.4) * 0.05, Math.sin(t * 0.6) * 0.08, Math.sin(t * 0.35) * 0.03],
    [Math.sin(t * 1.0) * 0.07 - 0.02, Math.sin(t * 0.8) * 0.12, Math.sin(t * 0.5) * 0.04]
  );

  // Spine — breathing
  b(VRMHumanBoneName.Spine,
    [0.03 + Math.sin(t * 1.2) * 0.015, 0, 0],
    [0.04 + Math.sin(t * 1.2) * 0.02, Math.sin(t * 0.5) * 0.02, 0]
  );

  // Chest
  b(VRMHumanBoneName.Chest,
    [Math.sin(t * 1.2 + 0.5) * 0.01, 0, 0],
    [Math.sin(t * 1.2 + 0.5) * 0.015, 0, 0]
  );

  // UpperChest
  b(VRMHumanBoneName.UpperChest,
    [0, Math.sin(t * 0.35 + 0.5) * 0.02, 0],
    [0, Math.sin(t * 0.45 + 0.5) * 0.03, 0]
  );

  // Hips
  b(VRMHumanBoneName.Hips,
    [0, Math.sin(t * 0.3) * 0.03, Math.sin(t * 0.25) * 0.01],
    [0, Math.sin(t * 0.4) * 0.04, Math.sin(t * 0.3) * 0.015]
  );

  // ── Arms: use X+Z compound (confirmed working) ──
  // Left upper arm: X forward + Z negative = arm down
  b(VRMHumanBoneName.LeftUpperArm,
    [0.3 + Math.sin(t * 0.5) * 0.04, Math.sin(t * 0.4) * 0.03, -0.6 + Math.sin(t * 0.6) * 0.04],
    [0.35 + Math.sin(t * 0.6) * 0.06, Math.sin(t * 0.5) * 0.04, -0.5 + Math.sin(t * 0.7) * 0.05]
  );

  // Right upper arm: X forward + Z positive = arm down
  b(VRMHumanBoneName.RightUpperArm,
    [0.3 + Math.sin(t * 0.5 + 1) * 0.04, Math.sin(t * 0.4 + 1) * -0.03, 0.6 + Math.sin(t * 0.6 + 0.5) * 0.04],
    [0.4 + Math.sin(t * 1.0) * 0.1, Math.sin(t * 0.8) * 0.06, 0.35 + Math.sin(t * 1.3) * 0.1]
  );

  // Left lower arm: small X + Y for natural elbow bend
  b(VRMHumanBoneName.LeftLowerArm,
    [0.05, -0.2 + Math.sin(t * 0.7) * 0.03, 0],
    [0.05, -0.3 + Math.sin(t * 0.8) * 0.04, 0]
  );

  // Right lower arm
  b(VRMHumanBoneName.RightLowerArm,
    [0.05, 0.2 + Math.sin(t * 0.7 + 1) * 0.03, 0],
    [0.05, 0.35 + Math.sin(t * 1.1) * 0.06, 0]
  );

  return pose;
}

export default function VRMAvatar({ isSpeaking }: VRMAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationRef = useRef<number>(0);
  const blinkTimerRef = useRef(0);
  const mouthPhaseRef = useRef(0);
  const isSpeakingRef = useRef(isSpeaking);
  const timeRef = useRef(0);
  const prevTimeRef = useRef(0);
  const crossFadeRef = useRef(0);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let disposed = false;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
    camera.position.set(0, 0.9, 1.8);
    camera.lookAt(0, 0.85, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const keyLight = new THREE.DirectionalLight(0xfff0e0, 2.5);
    keyLight.position.set(1, 2.5, 3);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xe0e0ff, 1.2);
    fillLight.position.set(-2, 1.5, 1);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xc0b0ff, 0.8);
    rimLight.position.set(0, 1, -2);
    scene.add(rimLight);
    const bottomFill = new THREE.DirectionalLight(0xffffff, 0.6);
    bottomFill.position.set(0, -1, 1);
    scene.add(bottomFill);

    // Load VRM
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      "/models/cinderella.vrm",
      (gltf) => {
        if (disposed) return;
        const vrm = gltf.userData.vrm as VRM;
        scene.add(vrm.scene);
        vrmRef.current = vrm;
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Happy, 0.1);
        console.log("[VRM] Loaded OK");
      },
      undefined,
      (error) => console.error("VRM load error:", error)
    );

    // Animation loop
    const animate = () => {
      if (disposed) return;
      animationRef.current = requestAnimationFrame(animate);

      const vrm = vrmRef.current;
      if (!vrm) {
        renderer.render(scene, camera);
        return;
      }

      const speaking = isSpeakingRef.current;
      const now = performance.now() / 1000;
      const delta = prevTimeRef.current === 0 ? 0.016 : Math.min(now - prevTimeRef.current, 0.1);
      prevTimeRef.current = now;
      timeRef.current += delta;

      // Crossfade
      const target = speaking ? 1 : 0;
      if (Math.abs(crossFadeRef.current - target) > 0.001) {
        const step = delta * 1.0;
        crossFadeRef.current = target > crossFadeRef.current
          ? Math.min(crossFadeRef.current + step, 1)
          : Math.max(crossFadeRef.current - step, 0);
      } else {
        crossFadeRef.current = target;
      }
      const p = crossFadeRef.current;
      const w = p * p * (3 - 2 * p);

      // Blink
      blinkTimerRef.current += delta;
      if (blinkTimerRef.current > 3 + Math.random() * 4) {
        blinkTimerRef.current = 0;
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, 1.0);
        setTimeout(() => {
          vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, 0.0);
        }, 150);
      }

      // Lip sync
      if (speaking) {
        mouthPhaseRef.current += delta * 8;
        const mv = (Math.sin(mouthPhaseRef.current) * 0.3 + 0.3) * (0.7 + Math.random() * 0.3);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Aa, mv);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Happy, 0.2);
      } else {
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Aa, 0);
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Happy, 0.1);
      }

      // 1) Apply bone pose BEFORE vrm.update — this is the canonical pattern.
      //    vrm.update() internally calls humanoid.update() which transfers
      //    normalized rig bones → raw bones, then runs spring bones, constraints,
      //    and expressions on the correctly-posed skeleton.
      //    Setting the pose AFTER vrm.update() and calling humanoid.update() again
      //    can cause conflicts with node constraints and spring bone state.
      const pose = buildPose(timeRef.current, w);
      vrm.humanoid.setNormalizedPose(pose);

      // 2) vrm.update propagates pose to raw bones, then updates springs/constraints/expressions
      vrm.update(delta);

      renderer.render(scene, camera);
    };

    animationRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationRef.current);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: "500px" }}
    />
  );
}
