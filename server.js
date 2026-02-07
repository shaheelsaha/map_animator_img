import express from "express";
import puppeteer from "puppeteer";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import cors from "cors";

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

app.post("/render", async (req, res) => {

    try {
        const { lat1, lng1, lat2, lng2 } = req.body;

        console.log("Launching browser...");

        // Exact configuration for Cloud Run WebGL (SwiftShader)
        const browser = await puppeteer.launch({
            headless: "new",
            // Use the installed chrome from Dockerfile
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome",
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",

                // ⭐ Cloud Run WebGL fix
                "--use-gl=swiftshader",
                "--use-angle=swiftshader",
                "--disable-gpu",

                "--disable-dev-shm-usage",
                "--single-process",
                "--no-zygote"
            ]
        });
        const page = await browser.newPage();

        // Improve debugging: forward browser console logs to server logs
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));

        // Point to our own server (served via express static)
        const targetUrl = `http://localhost:${port}`;
        console.log(`Navigating to ${targetUrl}...`);

        // Optimize loading: wait for network idle to ensure textures are loaded
        // Optimize loading: Mapbox loads tiles endlessly, so 'networkidle0' times out.
        // We use 'domcontentloaded' and rely on the explicit waitForFunction below.
        await page.goto(targetUrl, {
            timeout: 120000,
            waitUntil: 'domcontentloaded'
        });

        // Explicitly wait for our app to be ready (bumping timeout for slow software WebGL)
        await page.waitForFunction('!!window.updateFlight', { timeout: 120000 });

        await page.evaluate((a, b, c, d) => {
            if (window.updateFlight) {
                window.updateFlight(a, b, c, d);
            }
        }, lat1, lng1, lat2, lng2);

        const frames = 600;
        const framesDir = "frames";

        if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);
        else {
            // clean up old frames
            try {
                fs.readdirSync(framesDir).forEach(f => fs.unlinkSync(`${framesDir}/${f}`));
            } catch (e) { console.log("cleanup error", e); }
        }

        console.log("Starting render...");

        for (let i = 0; i < frames; i++) {

            await page.evaluate((f) => {
                if (window.seekFrame) window.seekFrame(f, 600);
            }, i);

            await page.screenshot({
                path: `${framesDir}/${String(i).padStart(4, "0")}.png`
            });

            if (i % 50 === 0) console.log(`Rendered frame ${i}/${frames}`);
        }

        await browser.close();

        console.log("Encoding video...");

        ffmpeg(`${framesDir}/%04d.png`)
            .fps(60)
            .output("output.mp4")
            .on("end", () => {
                console.log("Video complete!");
                res.download("output.mp4");
            })
            .on("error", (err) => {
                console.error("FFmpeg error:", err);
                res.status(500).send("Encoding failed");
            })
            .run();

    } catch (error) {
        console.error("Render error:", error);
        res.status(500).send("Render failed: " + error.message);
    }
});

app.listen(port, () => console.log(`Render server running on ${port}`));
