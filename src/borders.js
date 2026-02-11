import * as THREE from "three";
import { latLngToVector3 } from "./utils/geo.js";

let geoJsonData = null;

// Load GeoJSON once
export async function loadBorders() {
    if (geoJsonData) return;
    try {
        // Using the file we downloaded to src/assets/world.geojson
        // Vite can import JSON directly or via URL. Let's use fetch for runtime loading.
        // We need to ensure the file is served. In Vite, assets in src/assets might need importing or moving to public.
        // For now, let's assume we can fetch it if we move it to public or import it.
        // Actually, importing it in JS is easier with Vite:
        // import worldData from './assets/world.geojson?url' 
        // But dynamic import might be better.

        // Let's rely on fetch from a known path. 
        // If 'src/assets/world.geojson' is not in public, fetch might fail in prod.
        // BUT for local dev, let's try importing it at the top level of this file 
        // or just fetching a public URL if local fails.
        // Actually, I'll use the raw github URL as a fallback or just put the content here if it was small.
        // It is 250kb, so better fetch.

        // Let's try to fetch the local file first. 
        // NOTE: In Vite, we should probably move it to `public/` or import it.
        // I will assume for now I can import it stringified or URL.

        const response = await fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json');
        geoJsonData = await response.json();
        console.log("🌍 Borders Loaded", geoJsonData.features.length, "countries");

        // DEBUG: Draw a few specific countries to test visibility immediately
        // setTimeout(() => highlightCountry(window.scene, "United States of America"), 2000);
        // setTimeout(() => highlightCountry(window.scene, "Australia"), 3000);

    } catch (e) {
        console.error("Failed to load borders", e);
    }
}

export function highlightCountry(scene, countryName) {
    if (!geoJsonData || !countryName) return;

    // Find feature
    // Mapbox returns vaguely standardized names. 
    // The GeoJSON has `properties.name`.
    const feature = geoJsonData.features.find(f =>
        f.properties.name.toLowerCase() === countryName.toLowerCase() ||
        (f.properties.name_long && f.properties.name_long.toLowerCase() === countryName.toLowerCase())
    );

    if (!feature) {
        console.warn(`⚠️ Country not found in GeoJSON: "${countryName}"`);
        if (geoJsonData && geoJsonData.features) {
            console.log("Example available countries:", geoJsonData.features.slice(0, 5).map(f => f.properties.name));
        }
        return;
    }

    console.log(`✨ Highlighting ${feature.properties.name}`);

    // Create Geometry
    // Handle Polygon and MultiPolygon
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const group = new THREE.Group();

    function drawPolygon(coords) {
        const points = [];
        // Coords is array of [lng, lat]
        coords.forEach(pt => {
            const [lng, lat] = pt;
            // Radius 1.0 is globe surface. 1.006 might be too close if Earth has bumps?
            // Earth has radius 1. Bump map might appear higher. 
            // Let's try 1.01 to be safe and visible.
            points.push(latLngToVector3(lat, lng, 1.01));
        });
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, material);
        group.add(line);
    }

    if (feature.geometry.type === 'Polygon') {
        feature.geometry.coordinates.forEach(ring => drawPolygon(ring));
    } else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(polygon => {
            polygon.forEach(ring => drawPolygon(ring));
        });
    }

    scene.add(group);

    // Auto-remove after 5 seconds or return allow manual removal
    // Let's return the group
    return group;
}
