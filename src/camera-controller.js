import * as THREE from "three";

export function createCameraController(camera, controls) {

    const state = {
        mode: "idle",
        progress: 0,
        startLat: 0,
        startLng: 0,
        endLat: 0,
        endLng: 0,
        distanceKm: 0,
        getPlanePos: null
    };

    function latLngToVector3(lat, lng, radius = 1) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lng + 180) * Math.PI / 180;

        return new THREE.Vector3(
            -radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }

    function kmToRadius(km) {
        if (km > 15000) return 4.0;
        if (km > 8000) return 3.0;
        if (km > 3000) return 2.2;
        if (km > 1000) return 1.8;
        return 1.4;
    }

    function update() {

        let target = null;

        // INTRO
        if (state.mode === "intro") {
            state.progress += 0.01;

            const from = camera.position.clone().normalize();
            const to = latLngToVector3(state.startLat, state.startLng, 1).normalize();

            // spherical rotation (NOT straight line)
            const rot = new THREE.Vector3().slerpVectors(from, to, state.progress);

            target = rot.multiplyScalar(3.5);

            if (state.progress >= 1) {
                state.mode = "follow";
                state.progress = 0;
            }
        }

        // FOLLOW
        else if (state.mode === "follow" && state.getPlanePos) {

            const planePos = state.getPlanePos();

            const dir = planePos.clone().normalize();

            // ALWAYS keep camera safely outside Earth
            const camDist = Math.max(3.5, kmToRadius(state.distanceKm) + 2.0);

            target = dir.multiplyScalar(camDist);
        }

        // OUTRO
        else if (state.mode === "outro") {
            state.progress += 0.01;

            target = latLngToVector3(state.endLat, state.endLng, 3.5);

            if (state.progress >= 1) {
                state.mode = "idle";
            }
        }

        if (target) {
            // ✅ REPLACE WITH THIS
            camera.position.copy(target);
            controls.target.set(0, 0, 0);
        }
    }

    function startIntro(lat, lng, km) {
        state.startLat = lat;
        state.startLng = lng;
        state.distanceKm = km;
        state.mode = "intro";
        state.progress = 0;
    }

    function startFollow(getPlanePosition) {
        state.getPlanePos = getPlanePosition;
        state.mode = "follow";
    }

    function startOutro(lat, lng) {
        state.endLat = lat;
        state.endLng = lng;
        state.mode = "outro";
        state.progress = 0;
    }

    return {
        update,
        startIntro,
        startFollow,
        startOutro
    };
}
