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
  getVolume: () => { volume: number; low: number; mid: number; high: number };
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

function buildPose(t: number, w: number): BonePose {
  const pose: BonePose = {};
  const b = (bone: string, idle: [number, number, number], speak: [number, number, number]) => {
    pose[bone] = { rotation: blendQ(eulerToQuat(...idle), eulerToQuat(...speak), w) };
  };

  b(VRMHumanBoneName.Head,
    [Math.sin(t * 0.4) * 0.05, Math.sin(t * 0.6) * 0.08, Math.sin(t * 0.35) * 0.03],
    [Math.sin(t * 1.0) * 0.07 - 0.02, Math.sin(t * 0.8) * 0.12, Math.sin(t * 0.5) * 0.04]
  );
  b(VRMHumanBoneName.Spine,
    [0.03 + Math.sin(t * 1.2) * 0.015, 0, 0],
    [0.04 + Math.sin(t * 1.2) * 0.02, Math.sin(t * 0.5) * 0.02, 0]
  );
  b(VRMHumanBoneName.Chest,
    [Math.sin(t * 1.2 + 0.5) * 0.01, 0, 0],
    [Math.sin(t * 1.2 + 0.5) * 0.015, 0, 0]
  );
  b(VRMHumanBoneName.UpperChest,
    [0, Math.sin(t * 0.35 + 0.5) * 0.02, 0],
    [0, Math.sin(t * 0.45 + 0.5) * 0.03, 0]
  );
  b(VRMHumanBoneName.Hips,
    [0, Math.sin(t * 0.3) * 0.03, Math.sin(t * 0.25) * 0.01],
    [0, Math.sin(t * 0.4) * 0.04, Math.sin(t * 0.3) * 0.015]
  );
  b(VRMHumanBoneName.LeftUpperArm,
    [0.3 + Math.sin(t * 0.5) * 0.04, Math.sin(t * 0.4) * 0.03, -0.6 + Math.sin(t * 0.6) * 0.04],
    [0.35 + Math.sin(t * 0.6) * 0.06, Math.sin(t * 0.5) * 0.04, -0.5 + Math.sin(t * 0.7) * 0.05]
  );
  b(VRMHumanBoneName.RightUpperArm,
    [0.3 + Math.sin(t * 0.5 + 1) * 0.04, Math.sin(t * 0.4 + 1) * -0.03, 0.6 + Math.sin(t * 0.6 + 0.5) * 0.04],
    [0.4 + Math.sin(t * 1.0) * 0.1, Math.sin(t * 0.8) * 0.06, 0.35 + Math.sin(t * 1.3) * 0.1]
  );
  b(VRMHumanBoneName.LeftLowerArm,
    [0.05, -0.2 + Math.sin(t * 0.7) * 0.03, 0],
    [0.05, -0.3 + Math.sin(t * 0.8) * 0.04, 0]
  );
  b(VRMHumanBoneName.RightLowerArm,
    [0.05, 0.2 + Math.sin(t * 0.7 + 1) * 0.03, 0],
    [0.05, 0.35 + Math.sin(t * 1.1) * 0.06, 0]
  );

  return pose;
}

export default function VRMAvatar({ isSpeaking, getVolume }: VRMAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationRef = useRef<number>(0);
  const blinkTimerRef = useRef(0);
  const isSpeakingRef = useRef(isSpeaking);
  const getVolumeRef = useRef(getVolume);
  const smoothVolumeRef = useRef(0);
  const smoothLowRef = useRef(0);
  const smoothMidRef = useRef(0);
  const smoothHighRef = useRef(0);
  const timeRef = useRef(0);
  const prevTimeRef = useRef(0);
  const crossFadeRef = useRef(0);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    getVolumeRef.current = getVolume;
  }, [getVolume]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let disposed = false;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
    camera.position.set(-0.037, 0.978, 1.596);
    camera.lookAt(-0.063, 0.671, 0.094);

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

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      "/models/cinderella.vrm",
      (gltf) => {
        if (disposed) return;
        const vrm = gltf.userData.vrm as VRM;
        scene.add(vrm.scene);
        vrmRef.current = vrm;

        // Disable overrideMouth on all expressions so lip sync is never blocked
        if (vrm.expressionManager) {
          for (const expr of vrm.expressionManager.expressions) {
            expr.overrideMouth = "none";
          }
        }

        console.log("[VRM] Loaded OK");
      },
      undefined,
      (error) => console.error("VRM load error:", error)
    );

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

      // Smooth, subtle lip sync using ARKit custom expressions
      if (speaking) {
        let audio = { volume: 0, low: 0, mid: 0, high: 0 };
        try { audio = getVolumeRef.current(); } catch { /* noop */ }

        // Time-based fallback when no audio data
        if (audio.volume < 0.01) {
          const t = timeRef.current;
          const base = 0.25 + Math.sin(t * 2.5) * 0.1;
          const jitter = Math.sin(t * 7.3) * 0.06 + Math.sin(t * 11.1) * 0.03;
          const pause = Math.sin(t * 1.2) > 0.85 ? 0 : 1;
          const fakeVol = Math.max(0, Math.min(1, (base + jitter) * pause));
          audio = { volume: fakeVol, low: fakeVol * 0.6, mid: fakeVol * 0.3, high: fakeVol * 0.1 };
        }

        // Per-band smoothing for natural transitions (lower alpha = smoother)
        const smoothAlpha = Math.min(1, delta * 8);
        smoothVolumeRef.current += (audio.volume - smoothVolumeRef.current) * smoothAlpha;
        smoothLowRef.current += (audio.low - smoothLowRef.current) * smoothAlpha;
        smoothMidRef.current += (audio.mid - smoothMidRef.current) * smoothAlpha;
        smoothHighRef.current += (audio.high - smoothHighRef.current) * smoothAlpha;

        const vol = smoothVolumeRef.current;
        const low = smoothLowRef.current;
        const mid = smoothMidRef.current;
        const high = smoothHighRef.current;

        // Subtle mouth shapes — reduced multipliers for natural look
        const jawOpen = Math.min(0.45, low * 0.6 + vol * 0.15);
        const funnel = Math.min(0.35, Math.max(0, low - mid) * 0.8);
        const smile = Math.min(0.25, mid * 0.4);
        const pucker = Math.min(0.2, high * 0.5);
        const lowerDown = Math.min(0.35, vol * 0.3);

        vrm.expressionManager?.setValue("jawOpen", jawOpen);
        vrm.expressionManager?.setValue("mouthFunnel", funnel);
        vrm.expressionManager?.setValue("mouthPucker", pucker);
        vrm.expressionManager?.setValue("mouthSmileLeft", smile);
        vrm.expressionManager?.setValue("mouthSmileRight", smile);
        vrm.expressionManager?.setValue("mouthLowerDownLeft", lowerDown);
        vrm.expressionManager?.setValue("mouthLowerDownRight", lowerDown);
      } else {
        // Gentle fade-out
        const fadeAlpha = Math.min(1, delta * 5);
        smoothVolumeRef.current += (0 - smoothVolumeRef.current) * fadeAlpha;
        smoothLowRef.current += (0 - smoothLowRef.current) * fadeAlpha;
        smoothMidRef.current += (0 - smoothMidRef.current) * fadeAlpha;
        smoothHighRef.current += (0 - smoothHighRef.current) * fadeAlpha;
        if (smoothVolumeRef.current < 0.005) smoothVolumeRef.current = 0;
        const fadeVol = smoothVolumeRef.current;
        vrm.expressionManager?.setValue("jawOpen", fadeVol * 0.4);
        vrm.expressionManager?.setValue("mouthFunnel", 0);
        vrm.expressionManager?.setValue("mouthPucker", 0);
        vrm.expressionManager?.setValue("mouthSmileLeft", 0.08);
        vrm.expressionManager?.setValue("mouthSmileRight", 0.08);
        vrm.expressionManager?.setValue("mouthLowerDownLeft", 0);
        vrm.expressionManager?.setValue("mouthLowerDownRight", 0);
      }

      // Bone pose
      const pose = buildPose(timeRef.current, w);
      vrm.humanoid.setNormalizedPose(pose);

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
