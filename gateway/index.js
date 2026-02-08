const express = require("express");
const { InstancesClient } = require("@google-cloud/compute");
const cors = require("cors");
const http = require("http");

const app = express();
app.use(cors());
app.use(express.json());

const PROJECT_ID = "map-animator-486522";
const ZONE = "us-central1-a";
const INSTANCE_NAME = "vertex-renderer";

const instancesClient = new InstancesClient();

// Helper: Check if VM is running
async function getVmStatus() {
    const [instance] = await instancesClient.get({
        project: PROJECT_ID,
        zone: ZONE,
        instance: INSTANCE_NAME,
    });
    return {
        status: instance.status,
        ip: instance.networkInterfaces[0].accessConfigs[0].natIP
    };
}

// Helper: Start VM
async function startVm() {
    console.log("🚀 Starting VM...");
    await instancesClient.start({
        project: PROJECT_ID,
        zone: ZONE,
        instance: INSTANCE_NAME,
    });
    console.log("✅ VM Start Operation Initiated");
}

// Helper: Wait for HTTP server to be ready
async function waitForServer(ip) {
    console.log(`⏳ Waiting for server at http://${ip}:8080...`);
    for (let i = 0; i < 60; i++) {
        try {
            await new Promise((resolve, reject) => {
                const req = http.get(`http://${ip}:8080/`, (res) => {
                    if (res.statusCode === 404 || res.statusCode === 200) resolve();
                    else reject();
                });
                req.on("error", reject);
                req.end();
            });
            console.log("✅ Server is ready!");
            return true;
        } catch (e) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    throw new Error("Server timed out");
}

// Main render endpoint
app.post("/render", async (req, res) => {
    try {
        console.log("🔍 Checking VM status...");
        let { status, ip } = await getVmStatus();
        console.log(`📊 VM Status: ${status}, IP: ${ip}`);

        if (status !== "RUNNING") {
            console.log("💤 VM is OFF. Waking it up...");
            await startVm();

            do {
                await new Promise(r => setTimeout(r, 2000));
                ({ status, ip } = await getVmStatus());
                console.log(`🔄 Polling VM Status: ${status}`);
            } while (status !== "RUNNING");
        }

        await waitForServer(ip);

        // Forward request to VM manually
        console.log("📤 Forwarding request to VM...");
        const bodyData = JSON.stringify(req.body);

        const proxyReq = http.request({
            hostname: ip,
            port: 8080,
            path: "/render",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyData)
            }
        }, (proxyRes) => {
            console.log(`📥 VM responded with status: ${proxyRes.statusCode}`);
            res.status(proxyRes.statusCode);
            res.set(proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on("error", (err) => {
            console.error("❌ Proxy Error:", err);
            res.status(500).send("Proxy error: " + err.message);
        });

        proxyReq.write(bodyData);
        proxyReq.end();

    } catch (error) {
        console.error("❌ Gateway Error:", error);
        res.status(500).send("Failed to start rendering server: " + error.message);
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Gateway running on ${PORT}`));
