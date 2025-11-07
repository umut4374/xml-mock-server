import express from "express";
import { XMLParser } from "fast-xml-parser";

const app = express();

// XML'i ham metin olarak al
app.use(express.text({ type: ["application/xml", "text/xml", "*/*"] }));

// Basit sağlık kontrolü
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "xml-mock", time: new Date().toISOString() });
});

// Debug için ping
app.post("/ping", (_req, res) => {
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.status(200).send(`<pong time="${new Date().toISOString()}" />`);
});

// A/B eşleştirmeli ödeme mock'u
app.post("/cc5/pay", (req, res) => {
  res.set("Content-Type", "application/xml; charset=utf-8");

  const xml = req.body || "";
  let r = {};
  try {
    const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
    const parsed = parser.parse(xml);
    r = parsed?.CC5Request || {};
  } catch (e) {
    return res.status(400).send(
      `<CC5Response>
         <Response>BadRequest</Response>
         <ProcReturnCode>98</ProcReturnCode>
         <ErrMsg>Invalid XML</ErrMsg>
       </CC5Response>`
    );
  }

  const orderId = r.OrderId ?? "";
  const clientId = r.ClientId ?? "";
  const type = r.Type ?? "";
  const total = r.Total ?? "";

  if (!orderId) {
    return res.status(400).send(
      `<CC5Response>
         <Response>BadRequest</Response>
         <ProcReturnCode>98</ProcReturnCode>
         <ErrMsg>Invalid or missing OrderId</ErrMsg>
       </CC5Response>`
    );
  }

  // ==== KURAL A (Approved) ====
  // İstediğin ilk senaryo: ClientId=190100000 & Type=Auth → Approved
  if (clientId === "190100000" && String(type).toUpperCase() === "AUTH") {
    return res.status(200).send(
      `<CC5Response>
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
           <TRXDATE>20251107 13:21:07</TRXDATE>
           <ERRORCODE></ERRORCODE>
           <CARDBRAND>MASTERCARD</CARDBRAND>
           <CARDISSUER>AKBANK T.A.S.</CARDISSUER>
           <KAZANILANPUAN>000000010.00</KAZANILANPUAN>
           <NUMCODE>00</NUMCODE>
         </Extra>
       </CC5Response>`
    );
  }

  // ==== Yeni kurallar (B, C, ...) için ŞABLON ====
  // Örn: belirli OrderId, Type, Total vb. eşleştiğinde özel cevap döndür.
  // if (orderId === "SENIN-B-ORDERID" && type === "Auth") {
  //   return res.status(200).send(`<CC5Response>...B cevabı...</CC5Response>`);
  // }

  // Eşleşme yoksa
  return res.status(404).send(
    `<CC5Response>
       <Response>NotMatched</Response>
       <ProcReturnCode>99</ProcReturnCode>
       <ErrMsg>No mock matched</ErrMsg>
     </CC5Response>`
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`XML mock server listening on ${PORT}`);
});
