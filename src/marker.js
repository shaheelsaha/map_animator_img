import * as THREE from "three";
import { latLngToVector3 } from "./utils/geo.js";

export function createPulseMarker(scene, lat, lng, color = 0x007aff) {
    const group = new THREE.Group();

    // 1. Center Dot (Solid)
    const dotGeo = new THREE.SphereGeometry(0.012, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: color });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    group.add(dot);

    // 2. Pulsing Ring (Transparent)
    // We use a RingGeometry or a CircleGeometry facing the normal
    const ringGeo = new THREE.RingGeometry(0.02, 0.03, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);

    // Align ring to surface normal
    // The ring is created in XY plane. We need it to face the normal of the sphere at (lat, lng).
    // Actually, simply adding it to the group and looking at the center of the earth (0,0,0) might work if we rotate the group?
    // Easier: Position the group at the coord, and make it lookAt(origin) * -1 (look away from center)

    group.add(ring);

    // Position Group
    const pos = latLngToVector3(lat, lng, 1.005); // Slightly above surface
    group.position.copy(pos);
    group.lookAt(new THREE.Vector3(0, 0, 0)); // Look at center implies Z-axis points to center?
    // We want the Z-axis of the object to point OUTWARDS.
    // group.lookAt(0,0,0) makes the positive Z axis point to 0,0,0.
    // Our ring is in XY plane. So it faces Z. 
    // We want ring to be flat on surface.

    // Let's use `lookAt` properly.
    // If we look at (0,0,0), the object's +Z axis points to center.
    // So the XY plane is tangent to the sphere surface!
    // That means our Ring (in XY) will be perpendicular to the radius? No, wait.
    // If Z points to center, XY plane IS tangent. Yes.
    // So the ring should be invisible from top? No, the ring is drawn in XY.
    // So if I look at the group from space, I see the XY plane.

    scene.add(group);

    // Animation State
    let scale = 1;
    let opacity = 0.8;

    function update() {
        scale += 0.015;
        opacity -= 0.015;

        if (opacity <= 0) {
            scale = 1;
            opacity = 0.8;
        }

        ring.scale.set(scale, scale, 1);
        ringMat.opacity = opacity;
    }

    return {
        mesh: group,
        update: update,
        remove: () => {
            scene.remove(group);
            dotGeo.dispose();
            dotMat.dispose();
            ringGeo.dispose();
            ringMat.dispose();
        }
    };
}
