import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import express from "express";
import QRCode from "qrcode";
import { google } from "googleapis";

// CONFIG
const SHEET_ID = process.env.SHEET_ID;
const CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS);

let qrImage = "";
let status = "Starting bot...";

// SERVER WEB
const app = express();
app.get("/", (req, res) => {
  res.send(`
    <h2>WhatsApp Bot</h2>
    <p>${status}</p>
    <h3>Scan QR</h3>
    ${qrImage ? `<img src="${qrImage}" width="300"/>` : "QR belum tersedia"}
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server aktif di port ${PORT}`));

// START BOT
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["RejectBot","Chrome","1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr } = update;

    if (qr) {
      qrImage = await QRCode.toDataURL(qr);
      status = "Scan QR di web";
      console.log("QR tersedia, scan lewat web!");
    }

    if (connection === "open") {
      status = "✅ BOT TERHUBUNG";
      console.log("BOT TERHUBUNG");
    }

    if (connection === "close") {
      console.log("⚠️ Terputus, reconnecting...");
      setTimeout(() => startBot(), 3000);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message) return;

      const from = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!text) return;

      if (!from.endsWith("@g.us")) return;

      const metadata = await sock.groupMetadata(from);
      if (metadata.subject !== "REJECT CORP CNM") return;
      if (!text.toLowerCase().includes("reject")) return;

      console.log("📩 Pesan diterima");

      const dateMatch = text.match(/tanggal\s+(\d{1,2}\s\w+\s\d{4})/i);
      const tanggal = dateMatch ? dateMatch[1] : "";

      const lines = text.split("\n");

      for (const line of lines) {
        const resiMatch = line.match(/\d{2}LP\d+/);
        if (!resiMatch) continue;

        const alasanMatch = line.match(/Direject karena -->\s*(.*?)\s*Dari/i);
        const corpMatch = line.match(/Dari Pos\/\s*(.*?)\s*Berat/i);
        const beratMatch = line.match(/Berat\s*\(kg\)\s*(\d+)/i);

        const resi = resiMatch[0];
        const alasan = alasanMatch ? alasanMatch[1]?.trim() : "";
        const corp = corpMatch ? corpMatch[1]?.trim() : "";
        const berat = beratMatch ? beratMatch[1] : "";
        const volume = "";
        const remarks = "";

        console.log("➡️ Resi:", resi);

        await saveToSheet(tanggal, resi, alasan, corp, berat, volume, remarks);
      }
    } catch (err) {
      console.log("❌ ERROR:", err);
    }
  });
}

// GOOGLE SHEET
async function saveToSheet(tanggal, resi, alasan, corp, berat, volume, remarks) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: CREDENTIALS,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A:G",
      valueInputOption: "RAW",
      requestBody: { values: [[tanggal, resi, alasan, corp, berat, volume, remarks]] },
    });

    console.log("✅ Tersimpan di Sheet");
  } catch (err) {
    console.log("❌ Gagal kirim ke Sheet:", err.message);
  }
}

// ERROR HANDLER
process.on("unhandledRejection", (err) => console.error("UnhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("UncaughtException:", err));

// START
startBot();
