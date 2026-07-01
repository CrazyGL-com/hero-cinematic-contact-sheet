import { jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
import * as THREE from 'three';
import { useHeroAnimationFrame, useHeroAssetGate } from '@crazygl/core';
const MAX_CARDS = 6;
// Default aspect (H/W) used while a screenshot texture is still loading.
// 1 / 1.78 ≈ 0.5618 — i.e. 16:9 in H/W form. The spec asks for 1.78 (W/H),
// which translates to a HEIGHT/WIDTH ratio of 1/1.78 since the geometry size
// formula is (cardScale, cardScale / aspectWH).
const DEFAULT_ASPECT_WH = 1.78;
/* ------------------------------------------------------------------------
   Procedural studio HDRI (equirect, 1024x512).

   Same recipe as hero-floating-metal-frame — vertical sky→floor gradient
   plus discrete radial softboxes. No horizontal continuous structure so
   the cards' rim reflections don't show stretched bands.
   ------------------------------------------------------------------------ */
function makeStudioEnv(keyHex, fillHex) {
    const W = 1024;
    const H = 512;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0.0, '#d8e1f0');
    sky.addColorStop(0.45, '#384258');
    sky.addColorStop(0.55, '#0e1320');
    sky.addColorStop(1.0, '#020409');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const boxes = [
        { x: W * 0.22, y: H * 0.18, r: 240, core: '#ffffff', halo: keyHex },
        { x: W * 0.80, y: H * 0.24, r: 200, core: '#e6ecff', halo: fillHex },
        { x: W * 0.50, y: H * 0.08, r: 90, core: '#ffffff', halo: '#ffffff' },
        { x: W * 0.12, y: H * 0.35, r: 55, core: '#ffffff', halo: '#ffffff' },
        { x: W * 0.66, y: H * 0.32, r: 60, core: '#ffffff', halo: '#ffffff' },
        { x: W * 0.93, y: H * 0.42, r: 45, core: '#ffffff', halo: '#ffffff' },
        // Floor darkening pools.
        { x: W * 0.25, y: H * 0.92, r: 90, core: '#08080c', halo: '#02020400' },
        { x: W * 0.75, y: H * 0.94, r: 80, core: '#08080c', halo: '#02020400' },
    ];
    ctx.globalCompositeOperation = 'lighter';
    for (const b of boxes) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0.0, b.core);
        g.addColorStop(0.4, b.halo);
        const fade = b.halo.length === 9 ? b.halo.slice(0, 7) + '00' : b.halo + '00';
        g.addColorStop(1.0, fade);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    return cv;
}
/* ------------------------------------------------------------------------
   Soft drop-shadow canvas. A radial gradient with a slight downward bias,
   used under each card to fake a contact shadow.
   ------------------------------------------------------------------------ */
function makeCardShadow() {
    const W = 512;
    const H = 384;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.55; // a touch below centre — shadow falls down/right
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.55);
    g.addColorStop(0.0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.45)');
    g.addColorStop(1.0, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return cv;
}
/* ------------------------------------------------------------------------
   Edge-glow canvas: a soft border around a rounded rectangle that fades
   outward. Applied to a BackSide plane behind the top card so we only see
   the glow extending past the card's edges, never over its face.
   ------------------------------------------------------------------------ */
function makeEdgeGlow(hex) {
    const W = 512;
    const H = 384;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    // Draw a rounded rect, blur it heavily, then "punch out" the centre so
    // only the outer halo remains.
    const r = Math.min(W, H) * 0.08;
    const padX = W * 0.07;
    const padY = H * 0.07;
    // Wide blurred border via multi-pass radial sweep.
    ctx.filter = 'blur(28px)';
    ctx.fillStyle = hex;
    const rx = W - 2 * padX;
    const ry = H - 2 * padY;
    const x = padX;
    const y = padY;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + rx - r, y);
    ctx.quadraticCurveTo(x + rx, y, x + rx, y + r);
    ctx.lineTo(x + rx, y + ry - r);
    ctx.quadraticCurveTo(x + rx, y + ry, x + rx - r, y + ry);
    ctx.lineTo(x + r, y + ry);
    ctx.quadraticCurveTo(x, y + ry, x, y + ry - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.filter = 'none';
    return cv;
}
/* ------------------------------------------------------------------------
   Build a rounded-rectangle plane geometry.

   The geometry is unit-width (w=1) and h=aspectHW (HEIGHT / WIDTH ratio),
   so the caller scales the whole card by cardSize on X and cardSize on Y
   directly — the actual world rect ends up cardSize wide × cardSize*aspectHW
   tall. cornerRadius is in 0..0.5 (fraction of the short side).

   We build a NEW geometry per card now because each card carries its own
   intrinsic aspect from the loaded texture. (Cheap — one ShapeGeometry per
   card; <= MAX_CARDS = 6 of them.)
   ------------------------------------------------------------------------ */
function buildRoundedRect(aspectHW, cornerRadius, segments = 8) {
    const w = 1;
    const h = aspectHW;
    const halfW = w / 2;
    const halfH = h / 2;
    const shortSide = Math.min(w, h);
    const r = Math.max(0.0001, Math.min(cornerRadius * shortSide, shortSide * 0.49));
    const shape = new THREE.Shape();
    shape.moveTo(-halfW + r, -halfH);
    shape.lineTo(halfW - r, -halfH);
    shape.absarc(halfW - r, -halfH + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(halfW, halfH - r);
    shape.absarc(halfW - r, halfH - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-halfW + r, halfH);
    shape.absarc(-halfW + r, halfH - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-halfW, -halfH + r);
    shape.absarc(-halfW + r, -halfH + r, r, Math.PI, 1.5 * Math.PI, false);
    const geom = new THREE.ShapeGeometry(shape, segments);
    // Generate UVs that span [0..1] across the rectangle (ShapeGeometry's
    // default UVs are in shape-space, which for our [-0.5..0.5]x[-h/2..h/2]
    // rect needs to be remapped to [0..1]x[0..1] before the screenshot
    // texture will land correctly).
    const pos = geom.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        uvs[i * 2] = (x + halfW) / w; // u
        // Top of geometry (highest Y) → v=1 (top of texture). Textures default
        // to flipY=true so image's top row maps to v=1; this leaves screenshots
        // reading top-down on the card (heading at top, content below).
        uvs[i * 2 + 1] = (y + halfH) / h; // v
    }
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.computeVertexNormals();
    return geom;
}
// Minimum per-slot Z separation in world units. Always added on top of the
// user-controlled stackOffsetZ so cards never share the same Z value — even
// when stackOffsetZ is dialed to 0. Keyed by the card's CURRENT stackIndex
// (slot in the sheet), so when cards swap positions during the flip cycle
// their Z offsets swap with them and the new front always sits at the front.
const MIN_Z_SEP = 0.04;
/* ------------------------------------------------------------------------
   Rest pose for a card at logical stackIndex k. Pure function of k and the
   stack offsets — keeps the flip animation simple (we just look up source +
   target poses and lerp between them).
   ------------------------------------------------------------------------ */
function restPose(k, dx, dy, dz) {
    return {
        x: k * dx,
        y: -k * dy,
        // -k*dz is the user-controlled spacing; -k*MIN_Z_SEP guarantees a
        // non-zero per-slot separation even when dz=0 so cards never z-fight
        // or visually intersect.
        z: -k * dz - k * MIN_Z_SEP,
        scale: 1.0 - k * 0.025,
        rotZ: (k % 2 === 0 ? 1 : -1) * 0.008 * k,
    };
}
function easeInOutCubic(t) {
    if (t <= 0)
        return 0;
    if (t >= 1)
        return 1;
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
/* ------------------------------------------------------------------------
   Recompute geometry + pivot/mesh offsets for a card after its intrinsic
   aspectHW (HEIGHT/WIDTH) changes.

   Anchor P (in root-local units, which already include the cardSize scale)
   sits 30% inset from the bottom-left corner, INSIDE the card body:
        P = (-cardW * 0.3, -cardH * 0.3)
   where cardW = cardSize (card root-local width) and
         cardH = cardSize * aspectHW (card root-local height).

   To keep the visible card centered at root's origin when pivot.rotation.z
   = 0, we place pivot at P and the card mesh at -P (relative to pivot).
   ------------------------------------------------------------------------ */
function applyCardAspect(c, cardSize, cardCornerRadius) {
    const aspectHW = c.aspectHW;
    const cardW = cardSize;
    const cardH = cardSize * aspectHW;
    // Rebuild geometry to match the new aspect (the underlying unit rect is
    // 1×aspectHW; the mesh scale below is (cardSize, cardSize, 1) so world
    // dimensions become cardSize × cardSize*aspectHW).
    const newGeom = buildRoundedRect(aspectHW, cardCornerRadius, 12);
    const oldGeom = c.geom;
    c.geom = newGeom;
    c.card.geometry = newGeom;
    c.shadow.geometry = newGeom;
    if (c.glow)
        c.glow.geometry = newGeom;
    oldGeom.dispose();
    // Pivot at P (anchor). +X is right, +Y is up, so 30% inset from
    // bottom-left is negative X by 30% of cardW, negative Y by 30% of cardH.
    c.pivot.position.set(-cardW * 0.3, -cardH * 0.3, 0);
    // Card mesh offset = -P, so when pivot rotation is 0 the card visually
    // recentres at root's origin.
    c.card.position.set(cardW * 0.3, cardH * 0.3, 0);
    c.card.scale.set(cardW, cardW, 1);
    // Shadow stays a touch larger and offset down/right for the contact
    // shadow look. Sits as a child of root (NOT pivot) so it doesn't track
    // the flip rotation — keeps the shadow on the ground plane while the
    // card swings up.
    c.shadow.scale.set(cardW * 1.12, cardW * 1.18, 1);
    c.shadow.position.set(0.025 * cardW, -0.02 * cardW, -0.015);
    if (c.glow) {
        c.glow.scale.set(cardW * 1.16, cardW * 1.20, 1);
        c.glow.position.set(0, 0, -0.01);
    }
}
export default function StackStage(props) {
    const { rootRef, size, input, reducedMotion, screenshots, cardCount, stackOffsetX, stackOffsetY, stackOffsetZ, cardSize, groupOffsetX, groupOffsetY, cardCornerRadius, flipCycle, cycleInterval, cursorTilt, ambientFloat, edgeGlowColor, edgeGlowStrength, shadowStrength, keyColor, fillColor, screenBrightness, } = props;
    // Hold the hero "not ready" until every screenshot TEXTURE the GL materials
    // need has settled (loaded or errored). The DOM can't see these THREE
    // textures, so we gate readiness on them explicitly.
    const [assetReady, setAssetReady] = React.useState(false);
    useHeroAssetGate(assetReady);
    const canvasRef = React.useRef(null);
    const rendererRef = React.useRef(null);
    const sceneRef = React.useRef(null);
    const cameraRef = React.useRef(null);
    const stackGroupRef = React.useRef(null);
    const cardsRef = React.useRef([]);
    const shadowTexRef = React.useRef(null);
    const glowTexRef = React.useRef(null);
    const envRTRef = React.useRef(null);
    const pmremRef = React.useRef(null);
    const keyLightRef = React.useRef(null);
    const fillLightRef = React.useRef(null);
    const yawRef = React.useRef(0);
    const pitchRef = React.useRef(0);
    const screenTexturesRef = React.useRef([]);
    const screenAspectsRef = React.useRef([]); // per-slot aspectHW
    const envLoadedRef = React.useRef(false);
    const startMsRef = React.useRef(0);
    const elapsedRef = React.useRef(0);
    // Flip-cycle state — counts down to the next flip; while a card is
    // flipping, holds the seconds-since-flip-started so all idle cards can
    // lerp from their previous rest pose to their new one in lockstep.
    const cycleTimerRef = React.useRef(0); // seconds until next flip starts
    const cycleProgressRef = React.useRef(-1); // -1 = idle, else 0..FLIP_TOTAL
    const flippingCardRef = React.useRef(null); // card index currently flipping
    // Set by the click handler — the rAF loop picks it up next tick and
    // triggers a flip immediately (if one isn't already running), then
    // re-arms the auto-flip timer to a full cycleInterval from now.
    const flipRequestedRef = React.useRef(false);
    // One-time renderer + scene + lights + PMREM.
    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            premultipliedAlpha: false,
            powerPreference: 'high-performance',
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.setClearColor(0x000000, 0);
        rendererRef.current = renderer;
        const scene = new THREE.Scene();
        scene.background = null;
        sceneRef.current = scene;
        const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
        camera.position.set(0, 0.05, 5.0);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;
        const key = new THREE.DirectionalLight(new THREE.Color(keyColor), 1.1);
        key.position.set(-2.0, 2.4, 4.0);
        scene.add(key);
        keyLightRef.current = key;
        const fill = new THREE.DirectionalLight(new THREE.Color(fillColor), 0.45);
        fill.position.set(2.2, -1.5, 3.0);
        scene.add(fill);
        fillLightRef.current = fill;
        const hemi = new THREE.HemisphereLight(0xc6d2e6, 0x10131c, 0.45);
        scene.add(hemi);
        const stack = new THREE.Group();
        scene.add(stack);
        stackGroupRef.current = stack;
        // Shared shadow + glow textures, built once.
        const shCv = makeCardShadow();
        const shTex = new THREE.CanvasTexture(shCv);
        shTex.colorSpace = THREE.SRGBColorSpace;
        shTex.minFilter = THREE.LinearFilter;
        shTex.magFilter = THREE.LinearFilter;
        shTex.generateMipmaps = false;
        shadowTexRef.current = shTex;
        const glCv = makeEdgeGlow(edgeGlowColor);
        const glTex = new THREE.CanvasTexture(glCv);
        glTex.colorSpace = THREE.SRGBColorSpace;
        glTex.minFilter = THREE.LinearFilter;
        glTex.magFilter = THREE.LinearFilter;
        glTex.generateMipmaps = false;
        glowTexRef.current = glTex;
        pmremRef.current = new THREE.PMREMGenerator(renderer);
        pmremRef.current.compileEquirectangularShader();
        startMsRef.current = performance.now();
        return () => {
            renderer.dispose();
            pmremRef.current?.dispose();
            pmremRef.current = null;
            envRTRef.current?.dispose();
            envRTRef.current = null;
            shadowTexRef.current?.dispose();
            shadowTexRef.current = null;
            glowTexRef.current?.dispose();
            glowTexRef.current = null;
            for (const t of screenTexturesRef.current)
                t?.dispose();
            screenTexturesRef.current = [];
            for (const c of cardsRef.current) {
                c.card.material.dispose();
                c.shadow.material.dispose();
                c.glow && c.glow.material.dispose();
                c.geom.dispose();
            }
            cardsRef.current = [];
            rendererRef.current = null;
            sceneRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Resize.
    React.useEffect(() => {
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        if (!renderer || !camera)
            return;
        const w = Math.max(1, Math.floor(size.width));
        const h = Math.max(1, Math.floor(size.height));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }, [size.width, size.height]);
    // HDRI rebuild on key/fill change.
    React.useEffect(() => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const pmrem = pmremRef.current;
        if (!renderer || !scene || !pmrem)
            return;
        const cv = makeStudioEnv(keyColor, fillColor);
        const eqTex = new THREE.CanvasTexture(cv);
        eqTex.mapping = THREE.EquirectangularReflectionMapping;
        eqTex.colorSpace = THREE.SRGBColorSpace;
        const rt = pmrem.fromEquirectangular(eqTex);
        eqTex.dispose();
        envRTRef.current?.dispose();
        envRTRef.current = rt;
        scene.environment = rt.texture;
        envLoadedRef.current = true;
        for (const c of cardsRef.current) {
            c.mat.envMapIntensity = 0.5;
            c.mat.needsUpdate = true;
        }
    }, [keyColor, fillColor]);
    // Update light colors live.
    React.useEffect(() => {
        keyLightRef.current?.color.set(keyColor);
        fillLightRef.current?.color.set(fillColor);
    }, [keyColor, fillColor]);
    // Rebuild edge-glow texture when its color changes.
    React.useEffect(() => {
        const glCv = makeEdgeGlow(edgeGlowColor);
        const newTex = new THREE.CanvasTexture(glCv);
        newTex.colorSpace = THREE.SRGBColorSpace;
        newTex.minFilter = THREE.LinearFilter;
        newTex.magFilter = THREE.LinearFilter;
        newTex.generateMipmaps = false;
        glowTexRef.current?.dispose();
        glowTexRef.current = newTex;
        for (const c of cardsRef.current) {
            if (c.glow) {
                c.glow.material.map = newTex;
                c.glow.material.needsUpdate = true;
            }
        }
    }, [edgeGlowColor]);
    // Load all screenshot textures whenever the URL list changes. Each
    // texture exposes its intrinsic pixel size (image.width, image.height),
    // from which we derive the card's aspect (HEIGHT / WIDTH). On load we
    // stash the texture in the slot, push it into the matching card material,
    // AND rebuild that card's geometry / pivot offsets to match the new
    // aspect.
    React.useEffect(() => {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous');
        let cancelled = false;
        // Gate readiness on ALL required textures: count the non-empty urls and
        // flip the single gate true once every one settles (success OR error).
        // If there are none to load, the gate opens immediately so it can't hang.
        const required = screenshots.filter((u) => !!u).length;
        let settled = 0;
        const settle = () => {
            settled += 1;
            if (!cancelled && settled >= required)
                setAssetReady(true);
        };
        if (required === 0) {
            setAssetReady(true);
        }
        screenshots.forEach((url, idx) => {
            if (!url)
                return;
            loader.load(url, (tex) => {
                if (cancelled) {
                    tex.dispose();
                    settle();
                    return;
                }
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.minFilter = THREE.LinearMipmapLinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.generateMipmaps = true;
                tex.anisotropy = 8;
                tex.needsUpdate = true;
                // Replace old texture for this slot.
                screenTexturesRef.current[idx]?.dispose();
                screenTexturesRef.current[idx] = tex;
                // Intrinsic aspect (HEIGHT / WIDTH). The texture's `image` is
                // the HTMLImageElement/canvas with naturalWidth/Height.
                const img = tex.image;
                const iw = img?.naturalWidth || img?.width || 0;
                const ih = img?.naturalHeight || img?.height || 0;
                const aspectHW = (iw > 0 && ih > 0) ? (ih / iw) : (1 / DEFAULT_ASPECT_WH);
                screenAspectsRef.current[idx] = aspectHW;
                // Push the texture into the matching card material AND
                // rebuild that card's geometry to match its true aspect.
                const c = cardsRef.current[idx];
                if (c) {
                    c.mat.map = tex;
                    c.mat.emissiveMap = tex;
                    c.mat.color.set('#ffffff');
                    c.mat.needsUpdate = true;
                    c.aspectHW = aspectHW;
                    applyCardAspect(c, cardSize, cardCornerRadius);
                }
                settle();
            }, undefined, () => {
                // Failed load — leave the slot empty (card stays dark).
                settle();
            });
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [screenshots]);
    // Build (or rebuild) the card meshes. We rebuild when count / size /
    // corner radius changes. Aspect is now per-card (sourced from each
    // texture) and is applied via applyCardAspect() either at build time
    // (using the previously-loaded aspect, if any) or by the texture-loader
    // effect above when a screenshot finishes loading.
    React.useEffect(() => {
        const stack = stackGroupRef.current;
        const shadowTex = shadowTexRef.current;
        const glowTex = glowTexRef.current;
        if (!stack || !shadowTex || !glowTex)
            return;
        const n = Math.max(2, Math.min(MAX_CARDS, Math.round(cardCount)));
        // Tear down old.
        for (const c of cardsRef.current) {
            stack.remove(c.root);
            c.card.material.dispose();
            c.shadow.material.dispose();
            c.glow && c.glow.material.dispose();
            c.geom.dispose();
        }
        cardsRef.current = [];
        for (let i = 0; i < n; i++) {
            const root = new THREE.Group();
            // Initial stackIndex matches the build-order index. Rest pose is
            // derived from stackIndex (see restPose() in the frame loop).
            const baseX = i * stackOffsetX;
            const baseY = -i * stackOffsetY;
            // Match restPose(): user-controlled spacing + always-on minimum
            // per-slot Z separation so cards never share the same Z.
            const baseZ = -i * stackOffsetZ - i * MIN_Z_SEP;
            const baseScale = 1.0 - i * 0.025;
            const baseRotZ = (i % 2 === 0 ? 1 : -1) * 0.008 * i;
            root.position.set(baseX, baseY, baseZ);
            root.scale.setScalar(baseScale);
            root.rotation.z = baseRotZ;
            // Existing texture for this slot (may be null until the loader fires).
            const existing = screenTexturesRef.current[i] ?? null;
            const mat = new THREE.MeshStandardMaterial({
                color: existing ? new THREE.Color(0xffffff) : new THREE.Color(0x141821),
                map: existing,
                emissive: new THREE.Color(0xffffff),
                emissiveIntensity: screenBrightness,
                emissiveMap: existing,
                metalness: 0.0,
                roughness: 0.6,
                envMapIntensity: 0.5,
                side: THREE.DoubleSide,
            });
            // Per-card aspect: use the already-loaded value if we have one,
            // otherwise the default while we wait for the texture.
            const aspectHW = screenAspectsRef.current[i] ?? (1 / DEFAULT_ASPECT_WH);
            const geom = buildRoundedRect(aspectHW, cardCornerRadius, 12);
            // Pivot group: origin at the card's BL-interior anchor P =
            // (-cardW*0.3, -cardH*0.3) in root-local units (where cardW = cardSize,
            // cardH = cardSize*aspectHW). Rotating pivot.rotation.z spins the card
            // CCW about P (positive Z is CCW from the camera's POV looking down -Z).
            const pivot = new THREE.Group();
            root.add(pivot);
            const cardMesh = new THREE.Mesh(geom, mat);
            pivot.add(cardMesh);
            // Soft drop shadow — slightly larger than the card, behind it.
            // Sits on root (not pivot) so it stays on the ground plane while the
            // card swings up/over during the flip.
            const shadowMat = new THREE.MeshBasicMaterial({
                map: shadowTex,
                transparent: true,
                depthWrite: false,
                opacity: shadowStrength,
                color: new THREE.Color(0x000000),
            });
            const shadowMesh = new THREE.Mesh(geom, shadowMat);
            root.add(shadowMesh);
            // Edge glow — top card only. BackSide so we only see the halo that
            // extends past the card edges, not a colored rectangle over the
            // card face. The glow plane sits a touch behind the card so the
            // card itself obscures the centre.
            let glowMesh = null;
            if (i === 0) {
                const glowMat = new THREE.MeshBasicMaterial({
                    map: glowTex,
                    transparent: true,
                    depthWrite: false,
                    opacity: edgeGlowStrength,
                    blending: THREE.AdditiveBlending,
                    side: THREE.BackSide,
                });
                glowMesh = new THREE.Mesh(geom, glowMat);
                root.add(glowMesh);
            }
            stack.add(root);
            const entry = {
                root,
                pivot,
                card: cardMesh,
                shadow: shadowMesh,
                glow: glowMesh,
                mat,
                geom,
                aspectHW,
                stackIndex: i,
                prevStackIndex: i,
                flipPhase: -1,
            };
            cardsRef.current.push(entry);
            // Apply pivot/mesh offsets for the initial aspect.
            applyCardAspect(entry, cardSize, cardCornerRadius);
        }
    }, [
        cardCount,
        stackOffsetX,
        stackOffsetY,
        stackOffsetZ,
        cardSize,
        cardCornerRadius,
        screenBrightness,
        shadowStrength,
        edgeGlowStrength,
    ]);
    // Live update — screen brightness / shadow / glow opacity without rebuilds.
    React.useEffect(() => {
        for (const c of cardsRef.current) {
            c.mat.emissiveIntensity = screenBrightness;
            c.shadow.material.opacity = shadowStrength;
            if (c.glow) {
                c.glow.material.opacity = edgeGlowStrength;
            }
        }
    }, [screenBrightness, shadowStrength, edgeGlowStrength]);
    // Reset the cycle timer whenever flipCycle is toggled on or the interval
    // changes — keeps the UX feeling responsive when the user tweaks the
    // slider in the customizer.
    React.useEffect(() => {
        cycleTimerRef.current = Math.max(0.5, cycleInterval * 0.6);
    }, [flipCycle, cycleInterval]);
    // Click anywhere on the hero to advance to the next card immediately.
    // The rAF loop picks up `flipRequestedRef` on the next tick: if a flip
    // is already running, the click is dropped (no queueing); otherwise the
    // front card kicks off and the auto-flip timer is rearmed to a fresh
    // `cycleInterval`. We listen on rootRef so the click region matches the
    // hero canvas exactly (not the page).
    React.useEffect(() => {
        const el = rootRef.current;
        if (!el)
            return;
        const onPointerDown = () => {
            if (!flipCycle)
                return; // honor the toggle
            flipRequestedRef.current = true;
        };
        el.addEventListener('pointerdown', onPointerDown);
        return () => el.removeEventListener('pointerdown', onPointerDown);
    }, [rootRef, flipCycle]);
    useHeroAnimationFrame(rootRef, ({ delta }) => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const stack = stackGroupRef.current;
        if (!renderer || !scene || !camera || !stack)
            return;
        const now = performance.now();
        if (!envLoadedRef.current && now - startMsRef.current < 1500) {
            renderer.setClearColor(0x000000, 0);
            renderer.clear();
            return;
        }
        const dt = reducedMotion ? 0 : Math.min(delta, 0.05);
        elapsedRef.current += dt;
        // Apply group offset — translates the WHOLE stack. This sits on top of
        // the parallax rotation (rotation is set below from yaw/pitch). Setting
        // position here is fine — rotation is applied around the group's local
        // origin, so children orbit the offset point.
        stack.position.x = groupOffsetX;
        stack.position.y = groupOffsetY;
        // Pointer parallax (±~8° yaw, ±~5° pitch at cursorTilt=1).
        const px = (input?.x ?? 0.5) * 2 - 1; // -1..1
        const py = (input?.y ?? 0.5) * 2 - 1;
        const targetYaw = -px * (Math.PI / 22.5) * cursorTilt; // ±8° at cursorTilt=1
        const targetPitch = py * (Math.PI / 36) * cursorTilt; // ±5°
        // Exponential smoothing — frame-rate independent.
        const ease = 1 - Math.exp(-Math.max(0.001, delta) * 7.5);
        yawRef.current += (targetYaw - yawRef.current) * ease;
        pitchRef.current += (targetPitch - pitchRef.current) * ease;
        stack.rotation.y = yawRef.current;
        stack.rotation.x = pitchRef.current;
        const cards = cardsRef.current;
        const N = cards.length;
        // Ambient float — gentle continuous bob of the whole stack so it never
        // reads as a static screenshot. Phase advances with elapsed time.
        const floatY = ambientFloat * 0.025 * Math.sin(elapsedRef.current * 0.9);
        const floatX = ambientFloat * 0.018 * Math.sin(elapsedRef.current * 0.7 + 1.3);
        // ── Flip-cycle scheduling ───────────────────────────────────────────
        // Every cycleInterval seconds the FRONT card (stackIndex === 0) begins
        // its move to the back. The motion is THREE-PHASE:
        //
        //   PHASE 1 (LIFT + ROTATE)  root.position translates UP 100% of card
        //                            height and LEFT 30% of card width, while
        //                            pivot.rotation.z spins CCW from 0 → +π/6
        //                            (+30°) around the BL-interior anchor.
        //                            Card goes "over" the other cards (Z is
        //                            held at front to keep it visually on top).
        //   PHASE 2 (Z TRANSLATION)  card stays up-left-rotated; root.position.z
        //                            translates from front to back. While the
        //                            card is out of the way, other cards slide
        //                            forward (their stackIndex was decremented
        //                            at t=0).
        //   PHASE 3 (REVERSE)        root.position lerps from up-left back to
        //                            backPose.xy, and pivot.rotation.z lerps
        //                            back from +π/6 to 0 (slight overshoot for
        //                            tactile feel).
        const FLIP_TOTAL = 0.95;
        if (flipCycle && !reducedMotion && N >= 2) {
            if (cycleProgressRef.current < 0) {
                // Idle — tick the timer.
                cycleTimerRef.current -= dt;
                // A manual click can request a flip ahead of schedule.
                const userTriggered = flipRequestedRef.current;
                if (userTriggered)
                    flipRequestedRef.current = false;
                if (cycleTimerRef.current <= 0 || userTriggered) {
                    // Find the current front card (stackIndex === 0) and kick it.
                    let frontIdx = -1;
                    for (let i = 0; i < N; i++) {
                        if (cards[i].stackIndex === 0) {
                            frontIdx = i;
                            break;
                        }
                    }
                    if (frontIdx >= 0) {
                        const front = cards[frontIdx];
                        front.flipPhase = 0;
                        flippingCardRef.current = frontIdx;
                        cycleProgressRef.current = 0;
                        // Re-shuffle stack indices NOW — every other card moves
                        // one slot toward the front; the flipping card goes to
                        // the back. prevStackIndex preserves the start pose for
                        // the lerp.
                        for (let i = 0; i < N; i++) {
                            const c = cards[i];
                            c.prevStackIndex = c.stackIndex;
                            if (i === frontIdx) {
                                c.stackIndex = N - 1;
                            }
                            else {
                                c.stackIndex = c.stackIndex - 1;
                            }
                        }
                    }
                    cycleTimerRef.current = cycleInterval;
                }
            }
            else {
                cycleProgressRef.current += dt;
                if (cycleProgressRef.current >= FLIP_TOTAL) {
                    // Finished — settle.
                    const idx = flippingCardRef.current;
                    if (idx !== null && cards[idx]) {
                        cards[idx].flipPhase = -1;
                    }
                    for (let i = 0; i < N; i++) {
                        cards[i].prevStackIndex = cards[i].stackIndex;
                    }
                    flippingCardRef.current = null;
                    cycleProgressRef.current = -1;
                }
            }
        }
        // Eased lerp factor for idle-card slide between rest poses. Idle cards
        // slide forward over the ENTIRE cycle (0 → FLIP_TOTAL) with
        // easeInOutCubic. By the end of phase 2 (~t=0.85s) they're 85%-eased,
        // so the back slot is essentially empty by the time the flipping card
        // arrives there in Z.
        let lerpT;
        if (cycleProgressRef.current < 0) {
            lerpT = 1;
        }
        else {
            const u = cycleProgressRef.current / FLIP_TOTAL;
            lerpT = easeInOutCubic(Math.min(1, Math.max(0, u)));
        }
        // ── Apply pose to every card ───────────────────────────────────────
        for (let i = 0; i < N; i++) {
            const card = cards[i];
            // Rest pose for the CURRENT stackIndex (target) and the PREVIOUS
            // one (source). We lerp from source→target as the cycle progresses.
            const targetPose = restPose(card.stackIndex, stackOffsetX, stackOffsetY, stackOffsetZ);
            const sourcePose = restPose(card.prevStackIndex, stackOffsetX, stackOffsetY, stackOffsetZ);
            let posX, posY, posZ, scale, rotZ;
            // pivotRotZ is applied to card.pivot. Positive Z is CCW from camera POV.
            let pivotRotZ = 0;
            if (card.flipPhase >= 0 && cycleProgressRef.current >= 0) {
                // FLIPPING CARD — three-phase motion. Source = the FRONT pose
                // (stackIndex 0 — where this card was before re-shuffle), Target =
                // the BACK pose (stackIndex N-1).
                const phase = cycleProgressRef.current;
                const frontPose = restPose(0, stackOffsetX, stackOffsetY, stackOffsetZ);
                const backPose = targetPose; // stackIndex set to N-1 at flip start
                // Card root-local size includes the per-card scale baked into the
                // rest pose (root.scale.setScalar(scale) below). The phase 1
                // translations are specified as fractions of CARD width/height
                // in WORLD units; we use the un-scaled card dimensions because
                // scale is applied to the whole root including the offset — so
                // using cardW/cardH directly here translates by the *scaled*
                // amount in world space (scale ≈ 1.0 at the front; same as a
                // constant for the user-visible effect). Keeping it simple.
                const cardW = cardSize;
                const cardH = cardSize * card.aspectHW;
                const ROT_CCW = Math.PI / 6; // +30° CCW about the BL-interior anchor
                const LIFT_Y = cardH * 1.0; // up 100% of card height
                const LIFT_X = -cardW * 0.3; // left 30% of card width (negative X)
                // Continuous single-curve model — every transformation runs
                // across the FULL duration, so lift, rotate, and Z-translate
                // all overlap and there's no segment-to-segment seam.
                //   • base XY: front rest → back rest, easeInOutCubic
                //   • Z: front.z → back.z, easeInOutCubic (+ tiny front-bias
                //     so the card visually sits above the stack at t=0)
                //   • lift offset (X/Y): sin(πu) bell curve — 0 at u=0/1,
                //     peak at u=0.5. Added ON TOP of the base XY.
                //   • rotation: same bell curve — comes in, peaks, goes out.
                //   • scale & rest-tilt rotZ: lerp front→back over u.
                const u = phase / FLIP_TOTAL; // 0..1 over the whole flip
                const eu = easeInOutCubic(u);
                const lift = Math.sin(u * Math.PI); // bell: 0 → 1 → 0
                const baseX = frontPose.x + (backPose.x - frontPose.x) * eu;
                const baseY = frontPose.y + (backPose.y - frontPose.y) * eu;
                posX = baseX + LIFT_X * lift;
                posY = baseY + LIFT_Y * lift;
                posZ = frontPose.z + (backPose.z - frontPose.z) * eu + 0.05 * (1 - eu);
                scale = frontPose.scale + (backPose.scale - frontPose.scale) * eu;
                rotZ = frontPose.rotZ + (backPose.rotZ - frontPose.rotZ) * eu;
                pivotRotZ = ROT_CCW * lift;
            }
            else {
                // IDLE CARD — lerp from source rest pose to target rest pose.
                posX = sourcePose.x + (targetPose.x - sourcePose.x) * lerpT;
                posY = sourcePose.y + (targetPose.y - sourcePose.y) * lerpT;
                posZ = sourcePose.z + (targetPose.z - sourcePose.z) * lerpT;
                scale = sourcePose.scale + (targetPose.scale - sourcePose.scale) * lerpT;
                rotZ = sourcePose.rotZ + (targetPose.rotZ - sourcePose.rotZ) * lerpT;
                pivotRotZ = 0;
            }
            card.root.position.x = posX + floatX;
            card.root.position.y = posY + floatY;
            card.root.position.z = posZ;
            card.root.scale.setScalar(scale);
            card.root.rotation.x = 0;
            card.root.rotation.y = 0;
            card.root.rotation.z = rotZ;
            card.pivot.rotation.x = 0;
            card.pivot.rotation.z = pivotRotZ;
        }
        // Secondary motion: whichever card is currently AT THE FRONT (stackIndex
        // === 0) and not flipping subtracts ~30% of the stack-wide tilt so it
        // stays more head-on to the viewer.
        for (let i = 0; i < N; i++) {
            const c = cards[i];
            if (c.stackIndex === 0 && c.flipPhase < 0) {
                c.root.rotation.y = -yawRef.current * 0.30;
                c.root.rotation.x = -pitchRef.current * 0.30;
                break;
            }
        }
        renderer.render(scene, camera);
    });
    return (_jsx("canvas", { ref: canvasRef, className: "crazygl-cs-canvas", "aria-hidden": "true" }));
}
