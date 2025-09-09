import express from "express";
import multer from "multer";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();


const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads folder if it doesn't exist
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// EJS ayarı
app.set("view engine", "ejs");

// Statik klasörler
app.use(express.static("uploads"));
app.use(express.urlencoded({ extended: true }));

// Multer dosya yükleme (çoklu resim)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-z0-9.]/gi, "_");
    cb(null, Date.now() + "-" + safeName);
  },
});
const upload = multer({ storage });

// Ana sayfa
app.get("/", (req, res) => {
  res.render("index");
});

// PDF oluşturma (buffer üzerinden)
app.post("/generate", upload.array("questionImages", 60), async (req, res) => {
  const images = req.files.map(f => f.path);
  const { testTitle, schoolName, description } = req.body;

  const doc = new PDFDocument({ size: "A4", margin: 40 });

  // Türkçe karakter desteği
  const fontPath = path.join(process.cwd(), "NotoSans-Medium.ttf");
  if (fs.existsSync(fontPath)) doc.font(fontPath);

  let buffers = [];
  doc.on("data", buffers.push.bind(buffers));

  doc.on("end", () => {
    const pdfData = Buffer.concat(buffers);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="test.pdf"',
      "Content-Length": pdfData.length,
    });
    res.send(pdfData);

    // Delete uploaded images after PDF is sent
    images.forEach((imgPath) => {
      const fullPath = path.resolve(imgPath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (err) {
          console.error(`Error deleting file ${fullPath}:`, err);
        }
      }
    });
  });

  // Grid ayarları
  const pageWidth = doc.page.width - 80;
  const pageHeight = doc.page.height - 160;
  const cols = 2;
  const rows = 4;
  const cellWidth = pageWidth / cols;
  const cellHeight = pageHeight / rows;
  const gap = 20; // Dikey çizgi ile resimler arası boşluk

  images.forEach((imgPath, idx) => {
    const positionInPage = idx % (cols * rows);

    if (positionInPage === 0) {
      if (idx !== 0) doc.addPage();

      // Başlık ve açıklama
      doc.fontSize(18).text(testTitle, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).text(schoolName, { align: "center" });
      doc.fontSize(10).text(description, { align: "center" });
      doc.moveDown(1);

      // Dikey mavi çizgi sütunlar arasında
      const verticalLineX = 40 + cellWidth;
      doc.moveTo(verticalLineX, doc.y)
         .lineTo(verticalLineX, doc.page.height - 40)
         .strokeColor("blue")
         .lineWidth(2)
         .stroke();
    }

    // Resim pozisyonu
    const col = positionInPage % cols;
    const row = Math.floor(positionInPage / cols);

    // Resim x koordinatı, çizgi ve gap ile ayarlandı
    let x;
    if (col === 0) {
      x = 40 + 5; // sol sütun, sol boşluk + margin
    } else {
      x = 40 + cellWidth + gap + 5; // sağ sütun, çizgi + gap + margin
    }
    const y = 150 + row * cellHeight;

    const fullPath = path.resolve(imgPath);
    doc.image(fullPath, x, y, {
      fit: [cellWidth - 10 - gap, cellHeight - 10],
      align: "center",
      valign: "center",
    });
  });

  doc.end();
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});