import * as THREE from "three";
import { latLngToVector3 } from "./utils/geo.js";

export function createCameraController(camera, controls) {

    let mode = "idle";
    let running = false;

    let getPosition = null;
    let getDistance = null;
    let currentMode = "flight";

    let progress = 0;

    let introTarget = null;
    let outroTarget = null;

    const SETTINGS = {
        smooth: 0.08,
        height: 1.2 // Reduced from 2.5 to make differences more visible
    };

    function kmToRadius(km) {
        console.log(`🔎 Zoom | Mode: ${currentMode} | Dist: ${Math.round(km)}km`);

        // FLIGHT (High Altitude)
        if (currentMode === "flight") {
            if (km > 10000) return 4.0;
            if (km > 5000) return 3.2;
            if (km > 2000) return 2.5;
            if (km > 1000) return 2.0;
            if (km > 200) return 1.5;
            return 1.25; // Minimum flight height
        }

        // CAR (Road Level)
        if (currentMode === "car") {
            if (km > 500) return 1.6;
            if (km > 100) return 1.3;
            if (km > 50) return 1.1;
            return 1.015; // Extremely close (Street view)
        }

        // TRAIN (Rail Level)
        if (currentMode === "train") {
            if (km > 1000) return 1.8;
            if (km > 500) return 1.4;
            return 1.08;
        }

        // Default
        return 1.3;
    }

    function update() {

        if (!running) return;

        let target = null;

        // ======================
        // INTRO
        // ======================
        if (mode === "intro" && introTarget) {

            progress += 0.02;

            const from = camera.position.clone().normalize();
            const to = latLngToVector3(introTarget[1], introTarget[0], 1).normalize();

            // quaternion spherical rotation (correct way)
            const qStart = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1), from
            );

            const qEnd = new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 0, 1), to
            );

            const q = qStart.clone().slerp(qEnd, progress);

            const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);

            target = dir.multiplyScalar(4);

            if (progress >= 1) {
                mode = "follow";
                progress = 0;
            }
        }

        // ======================
        // FOLLOW
        // ======================
        else if (mode === "follow" && getPosition) {

            const pos = getPosition();

            // Update mode if available
            if (getMode) currentMode = getMode();

            if (pos) {
                let dir;
                if (pos.isVector3) {
                    dir = pos.clone().normalize();
                } else {
                    dir = latLngToVector3(pos[1], pos[0], 1).normalize();
                }

                const km = getDistance ? getDistance() : 1000;
                console.log("Camera Distance:", km);

                const radius = kmToRadius(km); // Removed + SETTINGS.height
                console.log(`🔎 Zoom Radius: ${radius.toFixed(2)} | Dist: ${Math.round(km)}km | Mode: ${currentMode}`);

                target = dir.multiplyScalar(radius);
            }
        }

        // ======================
        // OUTRO
        // ======================
        else if (mode === "outro" && outroTarget) {

            progress += 0.02;

            const dir = latLngToVector3(outroTarget[1], outroTarget[0], 1);

            target = dir.multiplyScalar(3.0); // Simple outro zoom

            if (progress >= 1) {
                running = false;
                mode = "idle";
            }
        }

        // ======================
        // APPLY CAMERA
        // ======================
        if (target) {

            const currentDir = camera.position.clone().normalize();
            const targetDir = target.clone().normalize();

            currentDir.lerp(targetDir, SETTINGS.smooth).normalize();

            const currentRadius = camera.position.length();
            const targetRadius = target.length();

            const newRadius = THREE.MathUtils.lerp(
                currentRadius,
                targetRadius,
                SETTINGS.smooth
            );

            camera.position.copy(currentDir.multiplyScalar(newRadius));

            controls.target.set(0, 0, 0);
            controls.update();
        }

        requestAnimationFrame(update);
    }

    // ======================
    // PUBLIC API
    // ======================

    function playIntro(targetLngLat) {
        introTarget = targetLngLat;
        progress = 0;
        mode = "intro";

        if (!running) {
            running = true;
            requestAnimationFrame(update);
        }
    }

    let getMode = null;

    function startFollow(posFn, distFn, modeOrFn = "flight") {
        getPosition = posFn;
        getDistance = distFn;

        if (typeof modeOrFn === 'function') {
            getMode = modeOrFn;
        } else {
            getMode = () => modeOrFn;
        }

        mode = "follow";

        if (!running) {
            running = true;
            requestAnimationFrame(update);
        }
    }

    function playOutro(targetLngLat) {
        outroTarget = targetLngLat;
        progress = 0;
        mode = "outro";
    }

    return {
        playIntro,
        startFollow,
        playOutro
    };
}
