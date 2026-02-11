import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createCameraController } from "./src/camera.js";
import { latLngToVector3, haversine } from "./src/utils/geo.js";
import { createFlightTransport } from "./src/transports/flight.js";
import { createCarTransport } from "./src/transports/car.js";
import { createTrainTransport } from "./src/transports/train.js";
import earthImg from "./src/assets/earth-blue-marble.jpg";
import getStarfield from "./src/getStarfield.js";
import { createPulseMarker } from "./src/marker.js";


// ==========================
// 1. SCENE & RENDERER SETUP
// ==========================

function initRenderer() {
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

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Handle Resize
    window.addEventListener("resize", () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer, controls };
}

// ==========================
// 2. WORLD CREATION (Earth, Atmosphere, Stars)
// ==========================

function createWorld(scene) {
    const loader = new THREE.TextureLoader();

    // Earth
    const colorMap = loader.load(earthImg);
    colorMap.colorSpace = THREE.SRGBColorSpace;
    // We need renderer to max anisotropy usually, but we can standardise or pass renderer
    // For now, let's just leave anisotropy default or pass renderer if needed. 
    // Actually, in the original code: colorMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
    // We can just skip it or pass renderer. Let's pass renderer or just set to 16.
    colorMap.anisotropy = 16;

    const geometry = new THREE.SphereGeometry(1, 128, 128);
    const material = new THREE.MeshBasicMaterial({ map: colorMap });
    const globe = new THREE.Mesh(geometry, material);
    scene.add(globe);

    // Atmosphere
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

    // Stars
    const stars = getStarfield({ numStars: 2000 });
    scene.add(stars);

    return { globe, atmosphere, stars };
}

// ==========================
// 3. TRANSPORTS SETUP
// ==========================

function initTransports(scene) {
    const loader = new THREE.TextureLoader();
    const flightTransport = createFlightTransport(scene, loader);
    const carTransport = createCarTransport(scene, loader);
    const trainTransport = createTrainTransport(scene, loader);

    return {
        flight: flightTransport,
        car: carTransport,
        train: trainTransport
    };
}

// ==========================
// 4. EXPORT UI
// ==========================

function initExportModal() {
    console.log("Initializing Export Modal...");
    const modal = document.getElementById("export-modal");
    const openBtn = document.getElementById("open-export-btn");
    const cancelBtn = document.getElementById("cancel-export-btn");
    const confirmBtn = document.getElementById("confirm-export-btn");
    const statusText = document.getElementById("export-status");

    if (!modal || !openBtn || !cancelBtn || !confirmBtn) {
        console.error("❌ Export Modal Elements missing!", { modal, openBtn, cancelBtn, confirmBtn });
        return;
    }

    openBtn.onclick = () => {
        const hasFlightCoords = window.lastLat1 !== undefined && window.lastLat2 !== undefined;
        const hasGeocoderCoords = window.startCoords && window.lastStopCoords;

        if (!hasFlightCoords && !hasGeocoderCoords) {
            alert("Please select Start location and add at least one stop! 📍");
            return;
        }
        modal.style.display = "flex";
        statusText.innerText = "";
    };

    cancelBtn.onclick = () => {
        modal.style.display = "none";
    };

    confirmBtn.onclick = async () => {
        const resolution = document.getElementById("export-resolution").value;
        const fps = parseInt(document.getElementById("export-fps").value);
        const lat1 = window.lastLat1 ?? (window.startCoords ? window.startCoords[1] : null);
        const lng1 = window.lastLng1 ?? (window.startCoords ? window.startCoords[0] : null);
        // Use lastStopCoords (set by Fly button) instead of endCoords
        const lat2 = window.lastLat2 ?? (window.lastStopCoords ? window.lastStopCoords[1] : null);
        const lng2 = window.lastLng2 ?? (window.lastStopCoords ? window.lastStopCoords[0] : null);

        confirmBtn.disabled = true;
        cancelBtn.disabled = true;
        confirmBtn.innerText = "Rendering... ⏳";
        statusText.innerText = `Generating ${resolution} video at ${fps}fps...`;

        try {
            // 1. Send Request to Cloud Gateway (Handles Wake-up + Proxy)
            statusText.innerText = "Connecting to cloud fleet (may take ~60s if sleeping)... 🚀";
            const GATEWAY = "https://vertex-gateway-1040214381071.us-central1.run.app";

            // Construct route points from flightSegments
            const routePoints = [];
            if (flightSegments.length > 0) {
                routePoints.push(flightSegments[0].startCoords);
                flightSegments.forEach(seg => routePoints.push(seg.endCoords));
            } else {
                // Fallback if no segments yet (shouldn't happen if validation passes)
                routePoints.push({ lat: lat1, lng: lng1, mode: 'flight' });
                routePoints.push({ lat: lat2, lng: lng2, mode: 'flight' });
            }

            const res = await fetch(`${GATEWAY}/render`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": import.meta.env.VITE_API_KEY // 🔒 Secure Key
                },
                body: JSON.stringify({
                    routePoints,
                    lat1, lng1, lat2, lng2, // Keep for backward compat
                    resolution, fps,
                    quality: 80, duration: 10
                })
            });

            if (!res.ok) throw new Error(await res.text());

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `flight_${resolution}.mp4`;
            a.click();

            statusText.innerText = "✅ Done!";
            statusText.style.color = "#4caf50";
            setTimeout(() => {
                modal.style.display = "none";
                statusText.innerText = "";
                statusText.style.color = "#aaa";
            }, 2000);
        } catch (error) {
            console.error("Export failed:", error);
            statusText.innerText = "❌ Error: " + error.message;
            statusText.style.color = "#f44336";
        } finally {
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
            confirmBtn.innerText = "Start Export 🚀";
        }
    };
}


// ==========================
// MAIN INITIALIZATION
// ==========================

const { scene, camera, renderer, controls } = initRenderer();
const cameraController = createCameraController(camera, controls);

createWorld(scene);
const transports = initTransports(scene);

initExportModal();


// ==========================
// FLIGHT STATE & LOGIC
// ==========================

let flightSegments = [];
let currentSegmentIndex = 0;
let isFlying = false;
let t = 0;

window.updateFlight = async function (routePoints) {
    if (!routePoints || routePoints.length < 2) {
        console.error("Invalid route points:", routePoints);
        return;
    }

    // Reset
    flightSegments.forEach(s => scene.remove(s.line));
    flightSegments = [];
    currentSegmentIndex = 0;
    t = 0;

    // Create Segments & Calculate Distance
    let totalDistance = 0;

    for (let i = 0; i < routePoints.length - 1; i++) {
        const p1 = routePoints[i];
        const p2 = routePoints[i + 1];

        // Add segment distance
        // Use existing calculation if possible or re-calculate
        const dist = haversine(p1.lat, p1.lng, p2.lat, p2.lng);
        totalDistance += dist;

        const mode = p1.mode || 'flight';
        const transport = transports[mode] || transports['flight'];

        let curve = await transport.createCurve(p1, p2);

        const points = curve.getPoints(mode === 'flight' ? 50 : 200);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        // Start invisible
        lineGeo.setDrawRange(0, 0);

        const lineMat = new THREE.LineBasicMaterial({ color: transport.getColor() });
        const line = new THREE.Line(lineGeo, lineMat);
        scene.add(line);

        flightSegments.push({
            curve, line, mode, distance: dist,
            startCoords: p1,
            endCoords: p2
        });
    }

    // Update UI
    const statsEl = document.getElementById('route-stats');
    if (statsEl) {
        statsEl.innerText = `Total Distance: ${Math.round(totalDistance).toLocaleString()} km 🌍`;
    }

    // Camera Intro
    const first = flightSegments[0];
    cameraController.playIntro([first.startCoords.lng, first.startCoords.lat]);

    // Camera Follow
    cameraController.startFollow(
        () => {
            const seg = flightSegments[currentSegmentIndex];
            if (seg && seg.curve) return seg.curve.getPoint(Math.min(t, 0.999));
            return new THREE.Vector3();
        },
        () => {
            const seg = flightSegments[currentSegmentIndex];
            return seg ? seg.distance : 1000;
        },
        () => {
            const seg = flightSegments[currentSegmentIndex];
            return seg ? seg.mode : 'flight';
        }
    );

    isFlying = true;
}

window.seekFrame = function (frame, totalFrames = 600) {
    if (!flightSegments.length) return;

    const framesPerSegment = totalFrames / flightSegments.length;
    const segmentIndex = Math.floor(frame / framesPerSegment);
    const activeSegIndex = Math.min(segmentIndex, flightSegments.length - 1);
    const activeSeg = flightSegments[activeSegIndex];

    const segmentStartFrame = activeSegIndex * framesPerSegment;
    let localT = (frame - segmentStartFrame) / framesPerSegment;
    localT = Math.max(0, Math.min(1, localT));

    if (activeSeg && activeSeg.curve) {
        const point = activeSeg.curve.getPoint(localT);
        const transport = transports[activeSeg.mode] || transports['flight'];

        Object.values(transports).forEach(tr => tr.sprite.visible = false);
        transport.sprite.visible = true;
        transport.sprite.position.copy(point.normalize().multiplyScalar(1.03));
    }

    // cameraController.update(); // Handled internally now
    renderer.render(scene, camera);
};

// ==========================
// ANIMATION LOOP
// ==========================

const markers = []; // Track active markers

window.addMapMarker = function (lat, lng, type = 'start') {
    // Update Markers
    const color = type === 'start' ? 0x00ff00 : (type === 'stop' ? 0xffaa00 : 0xff0000);
    const marker = createPulseMarker(scene, lat, lng, color);
    markers.push(marker);
    console.log(`📍 Marker added at ${lat}, ${lng} (${type})`);

    // Focus Camera on Marker
    window.focusOnLocation(lat, lng);
};

window.focusOnLocation = function (lat, lng) {
    if (cameraController && cameraController.flyTo) {
        cameraController.flyTo([lng, lat]);
    }
};

window.clearMapMarkers = function () {
    markers.forEach(m => m.remove());
    markers.length = 0;
};

function animate() {
    requestAnimationFrame(animate);

    if (isFlying && flightSegments.length > 0) {
        t += 0.005;

        if (t >= 1) {
            t = 0;
            currentSegmentIndex++;
            if (currentSegmentIndex >= flightSegments.length) {
                isFlying = false;
                currentSegmentIndex = flightSegments.length - 1;
                t = 1;
                const last = flightSegments[flightSegments.length - 1];
                cameraController.playOutro([last.endCoords.lng, last.endCoords.lat]);

            }
        }
    }

    if (flightSegments.length > 0) {
        const seg = flightSegments[Math.min(currentSegmentIndex, flightSegments.length - 1)];
        if (seg) {
            const point = seg.curve.getPoint(Math.min(t, 1));
            const transport = transports[seg.mode] || transports['flight'];

            Object.values(transports).forEach(tr => tr.sprite.visible = false);
            transport.sprite.visible = true;
            transport.sprite.position.copy(point.normalize().multiplyScalar(1.03));

            // Updates line draw range
            if (seg.line && seg.line.geometry) {
                const totalPoints = seg.line.geometry.attributes.position.count;
                const drawCount = Math.floor(t * totalPoints);
                seg.line.geometry.setDrawRange(0, Math.max(1, drawCount));
            }
        }
    }

    // Update Markers
    markers.forEach(m => m.update());

    // cameraController.update(); // Handled internally now
    controls.update();
    renderer.render(scene, camera);
}

animate();
