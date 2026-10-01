import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function Scene() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const node = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
    camera.position.set(0, 0, 13);
    renderer.setClearColor(0, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    node.appendChild(renderer.domElement);
    // Trace the supplied joined-circle silhouette, including its central aperture.
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.55);
    shape.bezierCurveTo(-0.4, 1.55, -0.58, 2.03, -1.5, 2.03);
    shape.bezierCurveTo(-2.68, 2.03, -3.42, 1.04, -3.42, 0);
    shape.bezierCurveTo(-3.42, -1.2, -2.68, -2.03, -1.5, -2.03);
    shape.bezierCurveTo(-0.58, -2.03, -0.4, -1.55, 0, -1.55);
    shape.bezierCurveTo(0.4, -1.55, 0.58, -2.03, 1.5, -2.03);
    shape.bezierCurveTo(2.68, -2.03, 3.42, -1.04, 3.42, 0);
    shape.bezierCurveTo(3.42, 1.2, 2.68, 2.03, 1.5, 2.03);
    shape.bezierCurveTo(0.58, 2.03, 0.4, 1.55, 0, 1.55);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, 0.52, 1.34, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.44,
      bevelEnabled: true,
      bevelSize: 0.07,
      bevelThickness: 0.07,
      bevelSegments: 3,
      steps: 1,
      curveSegments: 64,
    });
    geometry.center();
    const front = new THREE.MeshStandardMaterial({
      color: 0x1638ed,
      roughness: 0.38,
      metalness: 0.12,
    });
    const side = new THREE.MeshStandardMaterial({
      color: 0x0d2494,
      roughness: 0.5,
    });
    const object = new THREE.Mesh(geometry, [front, side]);
    const back = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0x9bafff, roughness: 0.6 }),
    );
    back.position.z = -0.28;
    back.scale.setScalar(0.98);
    const group = new THREE.Group();
    group.add(back, object);
    scene.add(group, new THREE.HemisphereLight(0xffffff, 0x9aa5bc, 2.8));
    const key = new THREE.DirectionalLight(0xffffff, 4);
    key.position.set(-4, 6, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8aa5ff, 3);
    rim.position.set(4, -1, 3);
    scene.add(rim);
    // Continuous folded surfaces frame the mark, leaving the central reading lane open.
    const relief = new THREE.Group();
    const reliefGeometries: THREE.BufferGeometry[] = [];
    const reliefMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0xb4bdce,
        roughness: 0.52,
        metalness: 0.25,
        side: THREE.DoubleSide,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xf5f6f8,
        roughness: 0.6,
        metalness: 0.12,
        side: THREE.DoubleSide,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x2443ed,
        roughness: 0.4,
        metalness: 0.25,
        side: THREE.DoubleSide,
      }),
    ];
    for (const direction of [-1, 1]) {
      for (let layer = 0; layer < 6; layer++) {
        const surface = new THREE.PlaneGeometry(1, 1, 10, 100);
        const positions = surface.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const across = positions.getX(i) + 0.5;
          const along = positions.getY(i) + 0.5;
          const bend =
            Math.pow(along - (direction === 1 ? 0.42 : 0.66), 2) * 28;
          positions.setXYZ(
            i,
            direction * (3.75 + bend + layer * 1.25 + across * 1.3),
            along * 15 - 7.5,
            -2.8 +
              Math.sin(across * Math.PI) * 0.44 +
              Math.sin(along * 5 + layer * 0.24) * 0.65,
          );
        }
        surface.computeVertexNormals();
        reliefGeometries.push(surface);
        const fold = new THREE.Mesh(
          surface,
          reliefMaterials[layer === 3 ? 2 : layer % 2],
        );
        relief.add(fold);
      }
    }
    scene.add(relief);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let active = true,
      lost = false,
      frame = 0,
      raf = 0,
      px = 0,
      py = 0,
      logoY = 0,
      disposed = false;
    function resize() {
      const w = node.clientWidth,
        h = node.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(17)) * 13;
      const hero = node.closest("section")!;
      const sceneTop = node.getBoundingClientRect().top;
      const copyBottom =
        hero.querySelector(".opening-copy")!.getBoundingClientRect().bottom -
        sceneTop;
      const controlsTop =
        hero.querySelector(".opening-controls")!.getBoundingClientRect().top -
        sceneTop;
      const availableHeight = Math.max(80, controlsTop - copyBottom - 48);
      const logoWidth = Math.min(
        w * 0.68,
        w >= 1600 ? 520 : 420,
        (availableHeight * 6.98) / 4.4,
      );
      group.scale.setScalar(((logoWidth / h) * visibleHeight) / 6.98);
      logoY = (0.5 - (copyBottom + controlsTop) / 2 / h) * visibleHeight;
      relief.scale.x = Math.min(1.45, Math.max(0.48, camera.aspect / 1.9));
      render();
    }
    function render() {
      if (disposed || lost) return;
      const hero = node.closest("section")!;
      const scroll = Math.max(
        0,
        Math.min(1, -hero.getBoundingClientRect().top / hero.clientHeight),
      );
      const time = motion.matches ? 0 : performance.now() / 1000;
      group.rotation.set(
        motion.matches ? -0.1 : -0.1 + scroll * 0.6 + py * 0.07,
        motion.matches
          ? -0.13
          : -0.13 + Math.sin(time * 0.4) * 0.08 + scroll * 0.72 + px * 0.12,
        motion.matches ? -0.03 : -0.03 + scroll * 0.2,
      );
      back.position.z = -0.3 - (motion.matches ? 0 : scroll * 1.7);
      group.position.y =
        logoY + (motion.matches ? 0 : Math.sin(time * 0.6) * 0.05);
      relief.rotation.y = motion.matches ? 0 : px * 0.018 + scroll * 0.08;
      relief.position.y = motion.matches
        ? 0
        : scroll * 0.8 + Math.sin(time * 0.22) * 0.08;
      relief.position.z = motion.matches ? 0 : scroll * 0.6;
      renderer.render(scene, camera);
      frame++;
      (window as any).__oopadScene = {
        frames: frame,
        scroll,
        rotation: group.rotation.toArray().slice(0, 3),
        width: renderer.domElement.width,
        lost,
        reduced: motion.matches,
        reliefY: relief.position.y,
        reliefMeshes: relief.children.length,
      };
      setReady(true);
    }
    function tick() {
      raf = 0;
      if (disposed || lost || !active || document.hidden) return;
      try {
        render();
      } catch {
        setReady(false);
        return;
      }
      if (!motion.matches) raf = requestAnimationFrame(tick);
    }
    function resume() {
      cancelAnimationFrame(raf);
      raf = 0;
      if (active && !document.hidden && !lost) tick();
    }
    const pointer = (e: PointerEvent) => {
      px = e.clientX / innerWidth - 0.5;
      py = e.clientY / innerHeight - 0.5;
    };
    const lose = (e: Event) => {
      e.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      setReady(false);
    };
    const restore = () => {
      lost = false;
      resume();
    };
    const observer = new IntersectionObserver(([entry]) => {
      active = entry.isIntersecting;
      resume();
    });
    const size = new ResizeObserver(resize);
    observer.observe(node);
    size.observe(node);
    size.observe(node.closest("section")!.querySelector(".opening-copy")!);
    size.observe(node.closest("section")!.querySelector(".opening-controls")!);
    renderer.domElement.addEventListener("webglcontextlost", lose);
    renderer.domElement.addEventListener("webglcontextrestored", restore);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pointermove", pointer, { passive: true });
    motion.addEventListener("change", resume);
    resize();
    resume();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      size.disconnect();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pointermove", pointer);
      motion.removeEventListener("change", resume);
      renderer.domElement.removeEventListener("webglcontextlost", lose);
      renderer.domElement.removeEventListener("webglcontextrestored", restore);
      geometry.dispose();
      front.dispose();
      side.dispose();
      (back.material as THREE.Material).dispose();
      reliefGeometries.forEach((surface) => surface.dispose());
      reliefMaterials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      delete (window as any).__oopadScene;
    };
  }, []);
  return (
    <div
      ref={host}
      className={"oopad-scene " + (ready ? "ready" : "")}
      aria-hidden="true"
    >
      <img src="/oopad.png" className="scene-original" alt="" />
    </div>
  );
}
