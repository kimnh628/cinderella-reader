"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLoaderPlugin,
  VRM,
  VRMExpressionPresetName,
} from "@pixiv/three-vrm";
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from "@pixiv/three-vrm-animation";

interface VRMAvatarProps {
  isSpeaking: boolean;
}

export default function VRMAvatar({ isSpeaking }: VRMAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const idleActionRef = useRef<THREE.AnimationAction | null>(null);
  const speakingActionRef = useRef<THREE.AnimationAction | null>(null);
  const animationRef = useRef<number>(0);
  const blinkTimerRef = useRef(0);
  const mouthPhaseRef = useRef(0);
  const isSpeakingRef = useRef(isSpeaking);
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
    const vrmLoader = new GLTFLoader();
    vrmLoader.register((parser) => new VRMLoaderPlugin(parser));

    // Load VRMA helper
    async function loadVRMA(url: string) {
      const vrmaLoader = new GLTFLoader();
      vrmaLoader.register((p) => new VRMAnimationLoaderPlugin(p));
      const gltf = await new Promise<THREE.Object3D & { userData: Record<string, unknown> }>((res, rej) =>
        vrmaLoader.load(url, res as (gltf: unknown) => void, undefined, rej)
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (gltf as any).userData.vrmAnimations[0];
    }

    vrmLoader.load(
      "/models/cinderella.vrm",
      async (gltf) => {
        if (disposed) return;
        const vrm = gltf.userData.vrm as VRM;
        scene.add(vrm.scene);
        vrmRef.current = vrm;
        vrm.expressionManager?.setValue(VRMExpressionPresetName.Happy, 0.1);
        console.log("[VRM] Loaded OK");

        // Create mixer on the VRM scene
        const mixer = new THREE.AnimationMixer(vrm.scene);
        mixerRef.current = mixer;

        // Load VRMA animations
        try {
          const [idleAnim, speakingAnim] = await Promise.all([
            loadVRMA("/models/idle.vrma"),
            loadVRMA("/models/speaking.vrma"),
          ]);

          const idleClip = createVRMAnimationClip(idleAnim, vrm);
          const speakingClip = createVRMAnimationClip(speakingAnim, vrm);

          const idleAction = mixer.clipAction(idleClip);
          const speakingAction = mixer.clipAction(speakingClip);

          idleAction.setLoop(THREE.LoopRepeat, Infinity);
          speakingAction.setLoop(THREE.LoopRepeat, Infinity);

          idleAction.setEffectiveWeight(1);
          idleAction.play();
          speakingAction.setEffectiveWeight(0);
          speakingAction.play();

          idleActionRef.current = idleAction;
          speakingActionRef.current = speakingAction;

          console.log("[VRMA] Animations loaded OK");
        } catch (e) {
          console.warn("[VRMA] Loading failed:", e);
        }
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

      // Crossfade bone weights
      const target = speaking ? 1 : 0;
      if (Math.abs(crossFadeRef.current - target) > 0.001) {
        const step = delta * 2.0;
        crossFadeRef.current = target > crossFadeRef.current
          ? Math.min(crossFadeRef.current + step, 1)
          : Math.max(crossFadeRef.current - step, 0);
      } else {
        crossFadeRef.current = target;
      }
      const w = crossFadeRef.current;

      // Update VRMA action weights
      if (idleActionRef.current && speakingActionRef.current) {
        idleActionRef.current.setEffectiveWeight(1 - w);
        speakingActionRef.current.setEffectiveWeight(w);
      }

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

      // Update mixer (applies VRMA bone poses) then vrm.update (propagates to raw bones + springs)
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }
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
