const express = require("express");
const { InstanceGroupManagersClient, InstancesClient } = require("@google-cloud/compute");
const cors = require("cors");
const http = require("http");

const app = express();
app.use(cors());
app.use(express.json());

const PROJECT_ID = "map-animator-486522";
const ZONE = "us-central1-a";
const MIG_NAME = "vertex-renderer-mig";
const MAX_VMS = 10;

const igmClient = new InstanceGroupManagersClient();
const instancesClient = new InstancesClient();

// ==============================
// GATEWAY: Scale-Up + Smart Routing
// ==============================
// - Scales MIG up based on demand (1 VM per request, max 10)
// - Routes each request to an idle VM
// - VM handles its own shutdown after 5 min idle (see server.js)

let activeRequests = 0;
let busyIPs = new Set();

// Scale MIG to match demand
async function scaleMig(desiredSize) {
    const capped = Math.min(desiredSize, MAX_VMS);
    console.log(`📈 Scaling MIG to ${capped} VMs (${desiredSize} requested, max ${MAX_VMS})`);
    await igmClient.resize({
        project: PROJECT_ID,
        zone: ZONE,
        instanceGroupManager: MIG_NAME,
        size: capped
    });
}

// Get ALL running instances with their IPs
async function getRunningInstances() {
    try {
        const [list] = await igmClient.listManagedInstances({
            project: PROJECT_ID,
            zone: ZONE,
            instanceGroupManager: MIG_NAME,
        });

        const runningInstances = list.filter(inst => inst.instanceStatus === "RUNNING");
        const instances = [];

        for (const inst of runningInstances) {
            const instanceName = inst.instance.split("/").pop();
            try {
                const [details] = await instancesClient.get({
                    project: PROJECT_ID,
                    zone: ZONE,
                    instance: instanceName
                });
                const ip = details.networkInterfaces[0].accessConfigs[0].natIP;
                instances.push({ name: instanceName, ip });
            } catch (e) {
                // Instance might be transitioning
            }
        }

        return instances;
    } catch (e) {
        console.error("Error listing instances:", e);
        return [];
    }
}

// Find an IDLE (not busy) VM
async function getIdleInstance() {
    const instances = await getRunningInstances();
    if (instances.length === 0) return null;

    const idle = instances.find(inst => !busyIPs.has(inst.ip));
    if (idle) {
        console.log(`🎯 Found idle VM: ${idle.name} (${idle.ip})`);
        return idle;
    }

    // All busy — return null (caller will wait for new VM)
    console.log(`⚠️ All ${instances.length} VMs busy. Waiting for new VM...`);
    return null;
}

// Wait for HTTP server on VM
async function waitForServer(ip) {
    console.log(`⏳ Waiting for server at http://${ip}:8080...`);
    for (let i = 0; i < 60; i++) {
        try {
            await new Promise((resolve, reject) => {
                const req = http.get(`http://${ip}:8080/health`, { timeout: 2000 }, (res) => {
                    if (res.statusCode === 200 || res.statusCode === 404) resolve();
                    else reject(new Error(`Status: ${res.statusCode}`));
                });
                req.on("error", reject);
                req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
                req.end();
            });
            console.log("✅ Server connection established!");
            return true;
        } catch (e) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    console.warn("⚠️ Server check timed out, proceeding to proxy anyway...");
    return false;
}

app.post("/render", async (req, res) => {
    try {
        console.log("🔔 Render Request Received...");
        activeRequests++;

        // 1. Scale MIG to match active requests
        await scaleMig(activeRequests);

        // 2. Wait for an IDLE VM
        console.log(`⏳ Waiting for idle VM... (Active: ${activeRequests}, Busy: ${busyIPs.size})`);
        let targetInstance = null;

        for (let i = 0; i < 90; i++) {
            targetInstance = await getIdleInstance();
            if (targetInstance) break;
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!targetInstance) throw new Error("Timed out waiting for VM to boot.");

        const ip = targetInstance.ip;
        busyIPs.add(ip);

        // 3. Wait for server to be ready
        await waitForServer(ip);

        // 4. Proxy the request
        console.log(`📤 Proxying to http://${ip}:8080... (Active: ${activeRequests}, Busy VMs: ${busyIPs.size})`);
        const bodyData = JSON.stringify(req.body);

        const proxyReq = http.request({
            hostname: ip,
            port: 8080,
            path: "/render",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyData),
                "x-api-key": req.headers["x-api-key"]
            },
            timeout: 3600000
        }, (proxyRes) => {
            console.log(`📥 VM ${ip} responded: ${proxyRes.statusCode}`);
            res.status(proxyRes.statusCode);
            res.set(proxyRes.headers);
            proxyRes.pipe(res);

            proxyRes.on("end", () => {
                activeRequests--;
                busyIPs.delete(ip);
                console.log(`✅ Render complete on ${ip}. Active: ${activeRequests}, Busy VMs: ${busyIPs.size}`);
            });
        });

        proxyReq.on("error", (err) => {
            console.error("❌ Proxy Error:", err);
            activeRequests--;
            busyIPs.delete(ip);
            if (!res.headersSent) res.status(502).json({ error: "Upstream VM Error: " + err.message });
        });

        proxyReq.on("timeout", () => {
            console.error("❌ Proxy Timeout");
            proxyReq.destroy();
            activeRequests--;
            busyIPs.delete(ip);
            if (!res.headersSent) res.status(504).json({ error: "Render timed out" });
        });

        proxyReq.write(bodyData);
        proxyReq.end();

    } catch (error) {
        console.error("❌ Gateway Error:", error);
        activeRequests--;
        if (!res.headersSent) res.status(500).json({ error: error.message });
    }
});

/**
 * 🛑 SHUTDOWN ENDPOINT
 * VM calls this when it is idle to kill itself (and the whole MIG).
 */
app.post("/shutdown", async (req, res) => {
    // 1. Verify API Key
    const apiKey = req.headers["x-api-key"];
    // TODO: move key to env var for security
    const VALID_KEY = "ab24fa1cb3e943fa4f11aac6279ae317";

    if (apiKey !== VALID_KEY) {
        console.warn(`⛔ Unauthorized shutdown attempt from ${req.ip}`);
        return res.status(403).send("Forbidden");
    }

    console.log("🛑 Shutdown requested by VM. Resizing MIG to 0...");

    try {
        await scaleMig(0); // Resize to 0
        // Reset local state
        activeRequests = 0;
        busyIPs.clear();
        res.status(200).send("Scaling down to 0... Goodbye! 👋");
    } catch (e) {
        console.error("❌ Shutdown failed:", e);
        res.status(500).send(e.message);
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Gateway running on ${PORT}`));
