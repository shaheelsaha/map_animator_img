import express from "express";
import puppeteer from "puppeteer";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import cors from "cors";
import { exec } from "child_process";

const app = express();
const port = process.env.PORT || 8080;

// Serve static files from 'dist' folder (Vite build)
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
});
app.use(express.static("dist"));
app.use(cors());
app.use(express.json());

// 🕒 AUTO-SHUTDOWN LOGIC
const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
let lastActivity = Date.now();

// Middleware to update activity on every request
app.use((req, res, next) => {
    lastActivity = Date.now();
    next();
});

// Check for inactivity every minute
setInterval(() => {
    const idleTime = Date.now() - lastActivity;
    if (idleTime > IDLE_TIMEOUT) {
        console.log("💤 Server idle for 5 minutes. Shutting down VM to save money...");
        exec("sudo poweroff", (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Shutdown failed: ${error.message}`);
                return;
            }
            console.log(`✅ Shutdown initiated: ${stdout}`);
        });
    }
}, 60 * 1000);


app.post("/render", async (req, res) => {
    try {
        const {
            lat1, lng1, lat2, lng2,
            resolution = "720p",
            fps = 30,
            quality = 80,
            duration = 10
        } = req.body;

        // 🔍 DEBUG: Check disk space
        exec("df -h", (err, stdout, stderr) => {
            console.log("💾 DISK USAGE:\n" + stdout);
        });

        /* -----------------------------
           Resolution presets
        ----------------------------- */
        const sizes = {
            "480p": { w: 854, h: 480 },
            "720p": { w: 1280, h: 720 },
            "1080p": { w: 1920, h: 1080 },
            "2k": { w: 2560, h: 1440 },
            "4k": { w: 3840, h: 2160 }
        };

        const { w, h } = sizes[resolution] || sizes["720p"];

        // frames = fps * duration
        const frames = Math.floor(fps * duration);

        console.log(`
🎬 Render settings:
Resolution: ${resolution} (${w}x${h})
FPS: ${fps}
Duration: ${duration}s
Frames: ${frames}
JPEG Quality: ${quality}
`);

        /* -----------------------------
           Launch browser
        ----------------------------- */
        const browser = await puppeteer.launch({
            headless: "new",
            executablePath:
                process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--use-gl=swiftshader",
                "--use-angle=swiftshader",
                "--disable-gpu",
                "--disable-dev-shm-usage"
            ]
        });

        const page = await browser.newPage();

        /* ⭐ IMPORTANT: set resolution */
        await page.setViewport({
            width: w,
            height: h,
            deviceScaleFactor: 1
        });

        page.on("console", msg => console.log("BROWSER:", msg.text()));

        // Point to our own server
        const targetUrl = `http://localhost:${port}`;
        console.log(`🌍 Navigating to ${targetUrl}...`);

        try {
            // "networkidle0" is too strict for Mapbox (which loads tiles forever)
            // Use "domcontentloaded" and then wait for our specific function
            await page.goto(targetUrl, {
                timeout: 300000,
                waitUntil: "domcontentloaded"
            });
            console.log("✅ Page content loaded");
        } catch (e) {
            console.error("❌ Page load failed:", e);
            throw e;
        }

        console.log("⏳ Waiting for updateFlight...");
        // Wait for function to be exposed
        await page.waitForFunction("!!window.updateFlight", { timeout: 300000 });

        // Wait a bit more for map style to fully load (optional but safer)
        await new Promise(r => setTimeout(r, 5000));
        console.log("✅ updateFlight found & ready");

        await page.evaluate((a, b, c, d) => {
            console.log("🚀 Triggering updateFlight inside browser");
            window.updateFlight(a, b, c, d);
        }, lat1, lng1, lat2, lng2);

        /* -----------------------------
           Frame folder 
        ----------------------------- */
        const framesDir = "frames";

        if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);
        else {
            try {
                fs.readdirSync(framesDir).forEach(f => fs.unlinkSync(`${framesDir}/${f}`));
            } catch (e) { }
        }

        console.log("🎥 Rendering frames...");

        /* -----------------------------
           Render frames (JPEG FAST)
        ----------------------------- */
        for (let i = 0; i < frames; i++) {

            await page.evaluate((f, total) => {
                if (window.seekFrame) window.seekFrame(f, total);
            }, i, frames);

            await page.screenshot({
                path: `${framesDir}/${String(i).padStart(4, "0")}.jpg`,
                type: "jpeg",
                quality,
                clip: { x: 0, y: 0, width: w, height: h }
            });

            if (i % 20 === 0) console.log(`Frame ${i}/${frames}`);
        }

        await browser.close();

        /* -----------------------------
           Encode video
        ----------------------------- */
        console.log("🎞 Encoding video...");
        const outputName = "output.mp4";

        ffmpeg(`${framesDir}/%04d.jpg`)
            .fps(fps)
            .videoCodec("libx264")
            .outputOptions([
                "-pix_fmt yuv420p",
                "-preset ultrafast",
                "-crf 20",
                "-movflags +faststart"
            ])
            .output(outputName)
            .on("end", () => {
                console.log("✅ Done!");
                res.download(outputName, () => {
                    // Cleanup frames after download
                    try {
                        fs.rmSync(framesDir, { recursive: true, force: true });
                        console.log("🧹 Cleaned up frames");
                    } catch (e) {
                        console.error("Cleanup failed:", e);
                    }
                });
            })
            .on("error", err => {
                console.error(err);
                res.status(500).send("Encoding failed");
            })
            .run();

    } catch (err) {
        console.error(err);
        res.status(500).send("Render failed: " + err.message);
    }
});

app.listen(port, () => console.log(`Render server running on ${port}`));
