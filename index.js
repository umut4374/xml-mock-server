import express from "express";
import { XMLParser } from "fast-xml-parser";

const app = express();
const port = process.env.PORT || 10000;

/**
 * Sadece XML istekleri text olarak parse edilsin.
 * NOT: "*/*" kullanırsan urlencoded/parsers devre dışı kalır.
 */
app.use(
  express.text({
    type: ["application/xml", "text/xml"],
    defaultCharset: "utf-8",
  })
);

// Basit log
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (typeof req.body === "string") {
    console.log("body:", req.body.slice(0, 300));
  }
  next();
});

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "xml-mock", time: new Date().toISOString() });
});

// Default mock cevabı dönen endpoint (XML)
app.post(["/", "/cc5/pay"], (req, res) => {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
    const data = parser.parse(req.body || "");
    const orderId = data?.CC5Request?.OrderId || "UNKNOWN_ORDER";

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
</CC5Response>`.trim();

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.status(200).send(responseXml);
  } catch (err) {
    console.error("Parse error:", err);
    res.status(400).send("<error>Invalid XML</error>");
  }
});

/**
 * 3D form intercept + anında başarılı callback
 * Bu route URLENCODED form bekler, o yüzden route seviyesinde parser ekliyoruz.
 * (Global text parser XML'lerde kalıyor, burada çakışma yok.)
 */
app.post(
  "/fim/est3Dgate",
  express.urlencoded({ extended: true }),
  async (req, res) => {
    try {
      const body = req.body || {};
      const oid =
        body.oid || body.OrderId || body.orderId || "UNKNOWN_OID";
      // okURL alanını çeşitli olası isimlerle yakala
      const okURL =
        body.okURL ||
        body.okUrl ||
        body.okurl ||
        body.OKURL ||
        body.OkURL ||
        "";
      const amount = body.amount || "0.00";
      const pan = body.pan || "";
      const rnd = body.rnd || "";
      const storetype = body.storetype || "3d";

      if (!okURL) {
        console.log("No okURL in incoming 3D form", Object.keys(body));
        return res
          .status(400)
          .send("<html><body>Missing okURL in form</body></html>");
      }

      const systemTransId = `sys-${Date.now()}`;
      const query = new URLSearchParams({
        OrderId: oid,
        SystemTransId: systemTransId,
        Result: "3DSuccess", // sabit başarı
        TotalAmount: amount,
        InstallmentCount: "0",
        Hash: "DUMMY_HASH",
        MDStatus: "1",
        maskedCreditCard:
          pan && pan.length >= 8
            ? `${pan.slice(0, 4)} **** **** ${pan.slice(-4)}`
            : "",
        storetype,
        rnd,
      }).toString();

      const callbackUrl = okURL.includes("?")
        ? `${okURL}&${query}`
        : `${okURL}?${query}`;

      console.log(`[3DS MOCK] Sending success callback: ${callbackUrl}`);

      // Node 18+/20+ global fetch mevcut
      try {
        const cb = await fetch(callbackUrl, {
          method: "GET",
          redirect: "follow",
        });
        console.log(`[3DS MOCK] Callback HTTP ${cb.status}`);
      } catch (e) {
        console.warn("[3DS MOCK] Callback request failed:", e?.message || e);
      }

      const responsePage = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Mock ACS - Done</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:40px auto">
  <h3>3D Mock: callback sent</h3>
  <p>OrderId: <b>${oid}</b></p>
  <p>Sent callback to: <a href="${okURL}" target="_blank" rel="noreferrer">${okURL}</a></p>
  <p>SystemTransId: <b>${systemTransId}</b></p>
  <pre style="background:#f6f6f6;padding:12px;border-radius:6px">Result=3DSuccess, MDStatus=1, TotalAmount=${amount}</pre>
</body>
</html>`;
      res.status(200).send(responsePage);
    } catch (err) {
      console.error("[3DS MOCK] Error:", err);
      res.status(500).send("3DS mock internal error");
    }
  }
);

// Server start
app.listen(port, () => {
  console.log(`✅ XML mock sunucusu ${port} portunda yayında`);
});
