import * as THREE from "three";
import { latLngToVector3 } from "../utils/geo.js";
import planeImg from "../assets/plane.png";

export function createFlightTransport(scene, loader) {
    const planeTexture = loader.load(planeImg);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: planeTexture, transparent: true }));
    sprite.scale.set(0.12, 0.12, 1);
    scene.add(sprite);
    sprite.visible = false;

    return {
        sprite,
        createCurve: (p1, p2) => {
            const start = latLngToVector3(p1.lat, p1.lng, 1.01);
            const end = latLngToVector3(p2.lat, p2.lng, 1.01);

            const mid = start.clone().add(end).multiplyScalar(0.5);
            const dist = start.distanceTo(end);
            mid.normalize().multiplyScalar(1.0 + dist * 0.5); // Arc height

            return new THREE.QuadraticBezierCurve3(start, mid, end);
        },
        getColor: () => 0x00ffff
    };
}
