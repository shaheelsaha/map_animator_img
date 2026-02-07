import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createCameraController } from "./src/camera-controller.js";
import earthImg from "./src/earth-blue-marble.jpg";
import planeImg from "./src/plane.png";

/* ========= SCENE ========= */

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(0, 0, 3.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

/* ========= CONTROLS ========= */

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// 🚀 STEP 3 — Create controller
const cameraController = createCameraController(camera, controls);

/* ========= LIGHT ========= */

// Lights are not needed for MeshBasicMaterial
// scene.add(new THREE.AmbientLight(0xffffff, 1.5));

// const sun = new THREE.DirectionalLight(0xffffff, 2);
// sun.position.set(5, 3, 5);
// scene.add(sun);

/* ========= TEXTURE + GLOBE (ORIGINAL NASA ONLY) ========= */

const loader = new THREE.TextureLoader();

const colorMap = loader.load(earthImg);

colorMap.colorSpace = THREE.SRGBColorSpace;
colorMap.anisotropy = renderer.capabilities.getMaxAnisotropy();

const geometry = new THREE.SphereGeometry(1, 128, 128);

const material = new THREE.MeshBasicMaterial({
    map: colorMap
});

const globe = new THREE.Mesh(geometry, material);
scene.add(globe);

/* ========= REALISTIC ATMOSPHERE GLOW ========= */

const atmosphereGeometry = new THREE.SphereGeometry(1.12, 128, 128);

const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
        varying vec3 vNormal;

        void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        varying vec3 vNormal;

        void main() {
            float intensity = pow(0.6 - dot(vNormal, vec3(0,0,1.0)), 2.0);
            gl_FragColor = vec4(0.25, 0.6, 1.0, 1.0) * intensity;
        }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true
});

const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
scene.add(atmosphere);

/* ========= STARFIELD ========= */

const starsGeo = new THREE.BufferGeometry();
const starCount = 10000;

const positions = [];

for (let i = 0; i < starCount; i++) {
    positions.push(
        (Math.random() - 0.5) * 2000,
        (Math.random() - 0.5) * 2000,
        (Math.random() - 0.5) * 2000
    );
}

starsGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
);

const starsMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1,
    sizeAttenuation: true
});

const stars = new THREE.Points(starsGeo, starsMat);
scene.add(stars);

/* ========= HELPERS ========= */

function latLngToVector3(lat, lng, radius = 1) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;

    return new THREE.Vector3(
        -radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    );
}

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ==========================
// FLIGHT TEST
// ==========================

// ==========================
// FLIGHT LOGIC
// ==========================

// Global function to update flight path
window.updateFlight = function (lat1, lng1, lat2, lng2) {
    // 1. Convert to Vector3
    const start = latLngToVector3(lat1, lng1, 1.01);
    const end = latLngToVector3(lat2, lng2, 1.01);

    window.lastLat1 = lat1;
    window.lastLng1 = lng1;
    window.lastLat2 = lat2;
    window.lastLng2 = lng2;

    // 🚀 STEP 4 — Trigger on flight start
    const km = haversine(lat1, lng1, lat2, lng2);

    cameraController.startIntro(lat1, lng1, km);

    cameraController.startFollow(() =>
        window.currentCurve ? window.currentCurve.getPoint(t) : new THREE.Vector3()
    );

    // 2b. Create Curve
    const mid = start.clone().add(end).multiplyScalar(0.5);
    let dist = start.distanceTo(end);
    mid.normalize().multiplyScalar(1.0 + dist * 0.25); // Dynamic height based on distance

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);

    // 3. Update Arc Geometry
    const points = curve.getPoints(120);

    // project every point onto sphere surface + small height
    const safePoints = points.map(p =>
        p.clone().normalize().multiplyScalar(1.02)
    );

    arc.geometry.setFromPoints(safePoints);

    // 4. Update Animation Data
    window.currentCurve = curve; // Store for animation loop
    isFlying = true;
    t = 0; // Reset animation
}

// Initial Flight (NY -> London) for setup
const start = latLngToVector3(40.7128, -74.0060, 1.01);
const end = latLngToVector3(51.5072, -0.1276, 1.01);

const mid = start.clone().add(end).multiplyScalar(0.5);
mid.normalize().multiplyScalar(1.35);

const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
window.currentCurve = curve; // Expose for animate loop

// draw arc
const points = curve.getPoints(120);
const arcGeo = new THREE.BufferGeometry().setFromPoints(points);
const arcMat = new THREE.LineBasicMaterial({ color: 0x00ffff });
const arc = new THREE.Line(arcGeo, arcMat);
scene.add(arc);

const planeTexture = loader.load(planeImg);
const planeMaterial = new THREE.SpriteMaterial({ map: planeTexture, transparent: true });
const plane = new THREE.Sprite(planeMaterial);
plane.scale.set(0.12, 0.12, 1);
scene.add(plane);

/* ========= ANIMATE ========= */

let t = 0;
let isFlying = false;

function animate() {
    requestAnimationFrame(animate);

    if (isFlying) {
        t += 0.003;

        if (t >= 1) {
            t = 1;
            isFlying = false; // stop here
        }
    }

    if (window.currentCurve) {
        // ✅ new: keep constant altitude
        plane.position.copy(
            window.currentCurve.getPoint(t).normalize().multiplyScalar(1.03)
        );
    }

    // 🚀 STEP 5 — Update every frame
    cameraController.update();

    controls.update();
    renderer.render(scene, camera);
}

animate();

/* ========= RESIZE ========= */

window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 🟢 STEP 4 — Make deterministic renderer
window.seekFrame = function (frame, totalFrames = 600) {

    t = frame / totalFrames;

    if (window.currentCurve) {
        // reuse same altitude logic
        plane.position.copy(window.currentCurve.getPoint(t).normalize().multiplyScalar(1.03));
    }

    cameraController.update();

    renderer.render(scene, camera);
};

// 🟢 STEP 2 — Add button click handler
document.getElementById("export-btn").onclick = async () => {

    // 1. Validation: Ensure flight has happened
    if (window.lastLat1 === undefined || window.lastLat2 === undefined) {
        alert("Please fly a route first! ✈️\nSelect Start/End and click 'FLY ROUTE'.");
        return;
    }

    const btn = document.getElementById("export-btn");
    const originalText = btn.innerText;

    try {
        // 2. Loading State
        btn.innerText = "⏳ Rendering... (Wait ~2-3m)";
        btn.disabled = true;
        btn.style.opacity = "0.7";
        btn.style.cursor = "wait";

        // Use absolute Cloud Run URL because Firebase Hosting is a different domain
        const res = await fetch("https://vertex-earth-interactive-1040214381071.us-central1.run.app/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                lat1: window.lastLat1,
                lng1: window.lastLng1,
                lat2: window.lastLat2,
                lng2: window.lastLng2
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Server Error (${res.status}): ${errText}`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "flight.mp4";
        a.click();

        btn.innerText = "✅ Done! Save again?";

    } catch (error) {
        console.error("Export failed:", error);
        alert("Export Failed!\nCheck console for details.\n\n" + error.message);
        btn.innerText = "❌ Error (Try Again)";
    } finally {
        // 3. Restore State
        setTimeout(() => {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
            if (btn.innerText.includes("Error")) btn.innerText = originalText;
        }, 5000);
    }
};
