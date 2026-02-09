import * as THREE from "three";
import { latLngToVector3 } from "../utils/geo.js";
import carImg from "../assets/car.png";

// Helper to get token
const getMapboxToken = () => window.MB_TOKEN || 'pk.eyJ1Ijoic2hhaGVlbDU1IiwiYSI6ImNta2Q0cTNqZTA2cGszZ3M2dzVucDdsOGwifQ.WGhIdum-usVYkJJZOfr9UA';

async function fetchRoute(start, end) {
    const profile = 'mapbox/driving';
    const token = getMapboxToken();
    const url = `https://api.mapbox.com/directions/v5/${profile}/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&access_token=${token}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0) return null;
        return data.routes[0].geometry.coordinates; // [[lng, lat], ...]
    } catch (e) {
        console.error("Route fetch failed", e);
        return null;
    }
}

export function createCarTransport(scene, loader) {
    const carTexture = loader.load(carImg);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: carTexture, transparent: true }));
    sprite.scale.set(0.08, 0.08, 1);
    scene.add(sprite);
    sprite.visible = false;

    return {
        sprite,
        createCurve: async (p1, p2) => {
            const coords = await fetchRoute(p1, p2);
            if (coords) {
                const points = coords.map(c => latLngToVector3(c[1], c[0], 1.002));
                return new THREE.CatmullRomCurve3(points);
            } else {
                const start = latLngToVector3(p1.lat, p1.lng, 1.002);
                const end = latLngToVector3(p2.lat, p2.lng, 1.002);
                return new THREE.LineCurve3(start, end);
            }
        },
        getColor: () => 0xffaa00
    };
}
