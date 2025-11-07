import express from "express";
import { XMLParser } from "fast-xml-parser";

const app = express();
const port = process.env.PORT || 10000;

app.use(express.text({ type: ["application/xml", "text/xml", "*/*"] }));

// Basit log
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body) console.log("body:", req.body.slice(0, 300));
  next();
});

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "xml-mock", time: new Date().toISOString() });
});

// Default mock cevabı dönen endpoint
app.post(["/", "/cc5/pay"], (req, res) => {
  try {
    const parser = new XMLParser({ ignoreAttributes: false });
    const data = parser.parse(req.body);

    const orderId =
      data?.CC5Request?.OrderId || "UNKNOWN_ORDER";
    const responseXml = `
<CC5Response>
    <OrderId>${orderId}</OrderId>
    <GroupId>${orderId}</GroupId>
    <Response>Approved</Response>
    <AuthCode>621715</AuthCode>
    <HostRefNum>531113545069</HostRefNum>
    <ProcReturnCode>00</ProcReturnCode>
    <TransId>25311NVIA12472</TransId>
    <ErrMsg></ErrMsg>
    <Extra>
        <SETTLEID>2885</SETTLEID>
        <TRXDATE>${new Date().toISOString().replace("T", " ").split(".")[0]}</TRXDATE>
        <ERRORCODE></ERRORCODE>
        <CARDBRAND>MASTERCARD</CARDBRAND>
        <CARDISSUER>AKBANK T.A.S.</CARDISSUER>
        <KAZANILANPUAN>000000010.00</KAZANILANPUAN>
        <NUMCODE>00</NUMCODE>
    </Extra>
</CC5Response>`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.status(200).send(responseXml.trim());
  } catch (err) {
    console.error("Parse error:", err);
    res.status(400).send("<error>Invalid XML</error>");
  }
});

// Server start
app.listen(port, () => {
  console.log(`✅ XML mock sunucusu ${port} portunda yayında`);
});
// --- Simple 3D form interceptor + instant success callback ---
// Paste into your existing ES module server (index.js) below other routes

import express from "express";
import fetch from "node-fetch"; // If your Node has global fetch (v18+), you can drop this import
// If node-fetch isn't installed, either 'npm i node-fetch' or use global fetch if available.

app.post("/fim/est3Dgate", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    // req.body contains the form fields from the posted Get3DModelForm
    const body = req.body || {};
    const oid = body.oid || body.OrderId || body.orderId || "UNKNOWN_OID";
    const okURL = body.okURL || body.okUrl || body.okUrl || body.okurl || body.okURL;
    const failURL = body.failUrl || body.failURL || body.failurl || body.failURL;
    const amount = body.amount || "0.00";
    const pan = body.pan || "";
    const rnd = body.rnd || "";
    const storetype = body.storetype || "3d";

    // fallback okURL present?
    if (!okURL) {
      console.log("No okURL in incoming 3D form", Object.keys(body));
      // respond with the original HTML auto-submit behavior so tests don't break
      return res.status(200).send("<html><body>Missing okURL in form</body></html>");
    }

    // Build callback parameters (simple, no hash)
    // we mirror names similar to your logs: OrderId, SystemTransId, Result, TotalAmount, InstallmentCount, Hash, MDStatus
    const systemTransId = `sys-${Date.now()}`;
    const callbackQuery = new URLSearchParams({
      OrderId: oid,
      SystemTransId: systemTransId,
      Result: "3DSuccess",     // fixed success
      TotalAmount: amount,
      InstallmentCount: "0",
      Hash: "DUMMY_HASH",
      MDStatus: "1",
      // optional extras that are often useful:
      maskedCreditCard: pan ? (pan.slice(0,4) + " **** **** " + pan.slice(-4)) : "",
      storetype,
      rnd
    }).toString();

    const callbackUrl = okURL.includes("?") ? `${okURL}&${callbackQuery}` : `${okURL}?${callbackQuery}`;

    // Send GET callback to merchant okURL (non-blocking but we await to log result)
    console.log(`[3DS MOCK] Sending success callback to merchant: ${callbackUrl}`);

    // Use fetch to call the callback endpoint (GET)
    let fetchRes;
    try {
      fetchRes = await fetch(callbackUrl, { method: "GET", redirect: "follow", timeout: 10000 });
    } catch (err) {
      console.warn("[3DS MOCK] Callback request failed:", err.message || err);
      // continue — we will still respond to the browser
      fetchRes = null;
    }

    // Log result
    if (fetchRes) {
      const status = fetchRes.status;
      console.log(`[3DS MOCK] Callback responded with HTTP ${status}`);
      // optionally read body (careful with large bodies)
      // const text = await fetchRes.text(); console.log("[3DS MOCK] callback body:", text.slice(0,1000));
    }

    // Respond to the browser that posted to us with a small page (simulate ACS auto-post)
    const responsePage = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Mock ACS - Done</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:40px auto">
  <h3>3D Mock: callback sent</h3>
  <p>OrderId: <b>${oid}</b></p>
  <p>Sent callback to: <a href="${okURL}" target="_blank">${okURL}</a></p>
  <p>SystemTransId: <b>${systemTransId}</b></p>
  <pre style="background:#f6f6f6;padding:12px;border-radius:6px">Result=3DSuccess, MDStatus=1, TotalAmount=${amount}</pre>
  <p style="color:#666">Check your merchant logs / webhook receiver for the incoming request.</p>
</body>
</html>`;
    res.status(200).send(responsePage);

  } catch (err) {
    console.error("[3DS MOCK] Error handling incoming 3D form:", err);
    res.status(500).send("3DS mock internal error");
  }
});
