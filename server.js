import express from "express";
import puppeteer from "puppeteer";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import cors from "cors";
import { exec } from "child_process";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 8080;

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
// 2 minutes idle timeout
const IDLE_TIMEOUT = 2 * 60 * 1000;

let lastActivity = Date.now();
const IS_CLOUD_RUN = process.env.K_SERVICE || process.env.K_REVISION;

app.use(express.static("dist"));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get("/health", (req, res) => res.status(200).send("OK"));

// 🕒 Idle Watchdog
if (!IS_CLOUD_RUN) {
    console.log(`⏰ Idle watchdog active: ${IDLE_TIMEOUT / 60000}m timeout`);
    setInterval(() => {
        const idleTime = Date.now() - lastActivity;
        const remainingMs = IDLE_TIMEOUT - idleTime;

        if (remainingMs > 0) {
            // console.log(`⏳ Idle for ${Math.floor(idleTime / 1000)}s`);
        } else {
            console.log("💤 Idle timeout reached. Requesting shutdown via Gateway...");

            // Call Gateway /shutdown endpoint
            const GATEWAY_URL = "https://vertex-gateway-1040214381071.us-central1.run.app";
            const API_KEY = "ab24fa1cb3e943fa4f11aac6279ae317"; // Matches Gateway check

            fetch(`${GATEWAY_URL}/shutdown`, {
                method: "POST",
                headers: { "x-api-key": API_KEY }
            })
                .then(res => res.text())
                .then(text => console.log("✅ Shutdown response:", text))
                .catch(err => console.error("❌ Shutdown request failed:", err));
        }
    }, 60 * 1000);
}

app.use((req, res, next) => {
    // 🔒 Health Check (Skip for activity update & API key)
    if (req.path === "/health") return next();

    const apiKey = req.headers["x-api-key"];
    const VALID_KEY = "ab24fa1cb3e943fa4f11aac6279ae317"; // Matches frontend
    if (apiKey !== VALID_KEY) return res.status(403).json({ error: "Forbidden" });

    // Only update activity for VALID requests
    lastActivity = Date.now();
    next();
});

app.post("/render", async (req, res) => {
    try {
        const {
            routePoints, // <--- NEW: Array of points [{lat, lng, mode}, ...]
            lat1, lng1, lat2, lng2, // Keep for backward compat
            resolution = "720p",
            fps = 30,
            quality = 80,
            duration = 10
        } = req.body;

        // Construct route if not provided
        let points = routePoints;
        if (!points || points.length < 2) {
            points = [
                { lat: lat1, lng: lng1, mode: 'flight' },
                { lat: lat2, lng: lng2, mode: 'flight' }
            ];
        }

        const sizes = {
            "720p": { w: 1280, h: 720 },
            "1080p": { w: 1920, h: 1080 }
        };
        const { w, h } = sizes[resolution] || sizes["720p"];
        const totalFrames = Math.floor(fps * duration);

        console.log(`🎬 STARTING RENDER: ${totalFrames} frames`);

        const browser = await puppeteer.launch({
            headless: "new",
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome",
            args: [
                "--no-sandbox", "--disable-setuid-sandbox",
                "--use-gl=swiftshader", "--disable-gpu",
                "--disable-dev-shm-usage",
                `--window-size=${w},${h}`
            ]
        });

        try {
            const page = await browser.newPage();
            await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });

            // Navigate to local server
            await page.goto(`http://localhost:${port}`, { waitUntil: "domcontentloaded", timeout: 300000 });

            // Wait for app ready
            await page.waitForFunction("!!window.updateFlight", { timeout: 300000 });

            // Wait a bit for map settle
            await new Promise(r => setTimeout(r, 5000));

            // Start Flight Logic with FULL ROUTE
            await page.evaluate((pts) => {
                console.log("🚀 Triggering updateFlight with route:", pts);
                window.updateFlight(pts);
            }, points);

            // Prepare Frames Directory
            const framesDir = "frames";
            if (fs.existsSync(framesDir)) fs.rmSync(framesDir, { recursive: true, force: true });
            fs.mkdirSync(framesDir);

            // RENDER LOOP
            for (let i = 0; i < totalFrames; i++) {
                // Seek
                await page.evaluate((f, total) => {
                    if (window.seekFrame) window.seekFrame(f, total);
                }, i, totalFrames);

                // Screenshot
                const fileName = String(i).padStart(4, "0") + ".jpg";
                await page.screenshot({
                    path: `${framesDir}/${fileName}`,
                    type: "jpeg",
                    quality,
                    clip: { x: 0, y: 0, width: w, height: h }
                });

                if (i % 20 === 0) console.log(`Frame ${i}/${totalFrames}`);
            }

            console.log("✅ ALL FRAMES RENDERED! Stitching video...");

            // Encoding
            const outputName = "output.mp4";
            ffmpeg(`${framesDir}/%04d.jpg`)
                .fps(fps)
                .videoCodec("libx264")
                .outputOptions(["-pix_fmt yuv420p", "-preset ultrafast", "-crf 20", "-movflags +faststart"])
                .output(outputName)
                .on("end", () => {
                    console.log("🎞 Encoding complete. Sending file...");
                    res.download(outputName, () => {
                        // Cleanup
                        fs.rmSync(framesDir, { recursive: true, force: true });
                    });
                })
                .on("error", (err) => {
                    console.error("FFmpeg Error:", err);
                    if (!res.headersSent) res.status(500).send("Encoding failed");
                })
                .run();

        } catch (e) {
            console.error("Render Error:", e);
            throw e;
        } finally {
            await browser.close();
        }

    } catch (err) {
        console.error("Render failed:", err);
        if (!res.headersSent) res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => console.log(`🚀 Render Server running on ${port}`));
